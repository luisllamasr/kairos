/**
 * Edge Function: cleanup-user-storage
 *
 * Called by the pg_net trigger `on_profile_deleted_cleanup_storage` defined in
 * migration 20260619000000. Removes all storage files owned by the deleted user.
 *
 * This function runs OUTSIDE the database transaction that deleted the user.
 * pg_net queues the HTTP request and sends it after the transaction commits,
 * so a cleanup failure never blocks or rolls back user/profile deletion.
 *
 * ── Trigger flow ─────────────────────────────────────────────────────────────
 *   DELETE auth.users
 *   → CASCADE deletes public.profiles
 *   → AFTER DELETE trigger → net.http_post() (queued, async)
 *   → transaction commits
 *   → pg_net worker POSTs to this function
 *   → Storage API deletes user files
 *
 * ── Scaling to new storage ───────────────────────────────────────────────────
 *   Add new bucket names to USER_STORAGE_BUCKETS when Kairos introduces new
 *   storage types (e.g. 'experiences' for experience media). No other changes
 *   are needed — the cleanup loop handles all registered buckets uniformly.
 *   All buckets must follow the {user_id}/<filename> path convention.
 *
 * ── Future in-app account deletion ──────────────────────────────────────────
 *   When a "Delete Account" feature is built, the app will call
 *   auth.admin.deleteUser(), which cascades to profiles, which fires the
 *   pg_net trigger. This function acts as the safety net for all deletion
 *   origins (app, dashboard, future cleanup jobs). It is idempotent — if
 *   files were already removed, the list step returns empty and it exits cleanly.
 *
 * ── Failure reconciliation ───────────────────────────────────────────────────
 *   On failure, this function is the sole writer of a row in
 *   public.storage_cleanup_failures (migration 20260729110000) recording the
 *   exact payload to retry, with backoff. On success, if a prior-failure row
 *   exists for this user, it's marked resolved. The `retry-storage-cleanup-
 *   failures` cron re-sends the stored payload — it never writes to the
 *   ledger itself, so there's exactly one writer of ledger state.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

/** attempt_count -> minutes until the next retry. Index 0 = after the 1st failure. */
const RETRY_BACKOFF_MINUTES = [15, 60, 360, 1440] as const
const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1 // 5th failure gives up

/**
 * All storage buckets that contain user-owned files.
 * Files must follow the {user_id}/<filename> path convention so this function
 * can list and remove them using the user's id as the folder prefix.
 */
const USER_STORAGE_BUCKETS = ['avatars'] as const

/** Payload shape sent by the pg_net trigger (mirrors the Supabase webhook format). */
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Record<string, unknown> | null
  old_record: Record<string, unknown> | null
}

/**
 * Upserts a public.storage_cleanup_failures row for this resource, bumping
 * attempt_count and computing the next backoff tier. Flips to
 * 'failed_permanently' after MAX_ATTEMPTS so the retry cron stops selecting it.
 */
async function recordCleanupFailure(
  supabase: ReturnType<typeof createClient>,
  args: { tableName: string; resourceId: string; payload: WebhookPayload; error: string },
): Promise<void> {
  const { data: existing } = await supabase
    .from('storage_cleanup_failures')
    .select('attempt_count')
    .eq('function_name', 'cleanup-user-storage')
    .eq('table_name', args.tableName)
    .eq('resource_id', args.resourceId)
    .maybeSingle()

  const attemptCount = (existing?.attempt_count ?? 0) + 1
  const isFinal = attemptCount >= MAX_ATTEMPTS
  const backoffMinutes = RETRY_BACKOFF_MINUTES[Math.min(attemptCount, RETRY_BACKOFF_MINUTES.length) - 1]

  const { error: upsertError } = await supabase
    .from('storage_cleanup_failures')
    .upsert(
      {
        function_name: 'cleanup-user-storage',
        table_name: args.tableName,
        resource_id: args.resourceId,
        payload: args.payload,
        attempt_count: attemptCount,
        last_error: args.error,
        next_retry_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
        status: isFinal ? 'failed_permanently' : 'pending',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'function_name,table_name,resource_id' },
    )

  if (upsertError) {
    console.error(`[cleanup-failure-ledger] failed to record failure: ${upsertError.message}`)
  }
}

/** Marks any existing failure row for this resource as resolved. No-op if none exists. */
async function recordCleanupSuccess(
  supabase: ReturnType<typeof createClient>,
  args: { tableName: string; resourceId: string },
): Promise<void> {
  const { error: updateError } = await supabase
    .from('storage_cleanup_failures')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('function_name', 'cleanup-user-storage')
    .eq('table_name', args.tableName)
    .eq('resource_id', args.resourceId)
    .neq('status', 'resolved')

  if (updateError) {
    console.error(`[cleanup-failure-ledger] failed to record success: ${updateError.message}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Verify the request originates from our own Supabase project.
  // The pg_net trigger (migration 20260619000000) sends:
  //   Authorization: Bearer <service-role-key>
  // where the key is read from Supabase Vault at trigger time.
  // SUPABASE_SERVICE_ROLE_KEY is automatically injected into all Edge Functions.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  // Ignore non-DELETE events. The pg_net trigger always sends type: 'DELETE',
  // but guard defensively in case the function is invoked from another path.
  if (payload.type !== 'DELETE' || !payload.old_record) {
    return new Response(
      JSON.stringify({ skipped: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const userId = payload.old_record.id as string | undefined
  if (!userId) {
    return new Response('old_record.id missing', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  )

  const errors: string[] = []

  for (const bucket of USER_STORAGE_BUCKETS) {
    // List all files under {userId}/ in this bucket.
    // Returns an empty array if the user never uploaded anything — that is fine.
    const { data: files, error: listError } = await supabase.storage
      .from(bucket)
      .list(userId)

    if (listError) {
      const msg = `list failed in '${bucket}': ${listError.message}`
      console.error(`[cleanup-user-storage] ${msg} | user: ${userId}`)
      errors.push(msg)
      continue
    }

    if (!files || files.length === 0) {
      continue
    }

    const paths = files.map((f) => `${userId}/${f.name}`)

    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(paths)

    if (removeError) {
      const msg = `remove failed in '${bucket}': ${removeError.message}`
      console.error(`[cleanup-user-storage] ${msg} | user: ${userId} | paths: ${paths.join(', ')}`)
      errors.push(msg)
    } else {
      console.log(
        `[cleanup-user-storage] removed ${paths.length} file(s) from '${bucket}' | user: ${userId}`,
      )
    }
  }

  if (errors.length > 0) {
    await recordCleanupFailure(supabase, {
      tableName: 'profiles',
      resourceId: userId,
      payload,
      error: errors.join('; '),
    })
    return new Response(
      JSON.stringify({ success: false, userId, errors }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  await recordCleanupSuccess(supabase, { tableName: 'profiles', resourceId: userId })

  return new Response(
    JSON.stringify({ success: true, userId }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
