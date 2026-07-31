/**
 * Edge Function: cleanup-memory-storage
 *
 * Called by pg_net triggers on DELETE:
 *   • public.memories      → remove every file under memories/{memory_id}/
 *   • public.memory_media  → remove one file at old.storage_path
 *
 * Runs OUTSIDE the database transaction. Cleanup failure never rolls back deletion.
 *
 * Vault + deploy: same setup as migration 20260619000000 (avatars).
 *   npx supabase functions deploy cleanup-memory-storage
 *
 * ── Failure reconciliation ───────────────────────────────────────────────────
 *   Same ledger as cleanup-user-storage — see that file's header comment and
 *   migration 20260729110000 for the full design (this function is the sole
 *   writer of its own ledger rows; the retry cron only re-fires payloads).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MEMORY_STORAGE_BUCKET = 'memories'

/** attempt_count -> minutes until the next retry. Index 0 = after the 1st failure. */
const RETRY_BACKOFF_MINUTES = [15, 60, 360, 1440] as const
const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1 // 5th failure gives up

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Record<string, unknown> | null
  old_record: Record<string, unknown> | null
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
    .eq('function_name', 'cleanup-memory-storage')
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
        function_name: 'cleanup-memory-storage',
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
    .eq('function_name', 'cleanup-memory-storage')
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

  if (payload.type !== 'DELETE' || !payload.old_record) {
    return jsonResponse({ skipped: true })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  )

  if (payload.table === 'memory_media') {
    const storagePath = payload.old_record.storage_path as string | undefined
    if (!storagePath) {
      return new Response('old_record.storage_path missing', { status: 400 })
    }
    const mediaId = payload.old_record.id as string | undefined

    const { error: removeError } = await supabase.storage
      .from(MEMORY_STORAGE_BUCKET)
      .remove([storagePath])

    if (removeError) {
      const msg = `remove failed: ${removeError.message}`
      console.error(`[cleanup-memory-storage] ${msg} | path: ${storagePath}`)
      if (mediaId) {
        await recordCleanupFailure(supabase, { tableName: 'memory_media', resourceId: mediaId, payload, error: msg })
      }
      return jsonResponse({ success: false, storagePath, errors: [msg] }, 500)
    }

    if (mediaId) {
      await recordCleanupSuccess(supabase, { tableName: 'memory_media', resourceId: mediaId })
    }
    console.log(`[cleanup-memory-storage] removed media file | path: ${storagePath}`)
    return jsonResponse({ success: true, storagePath, removed: 1 })
  }

  if (payload.table === 'memories') {
    const memoryId = payload.old_record.id as string | undefined
    if (!memoryId) {
      return new Response('old_record.id missing', { status: 400 })
    }

    const { data: files, error: listError } = await supabase.storage
      .from(MEMORY_STORAGE_BUCKET)
      .list(memoryId)

    if (listError) {
      const msg = `list failed: ${listError.message}`
      console.error(`[cleanup-memory-storage] ${msg} | memory: ${memoryId}`)
      await recordCleanupFailure(supabase, { tableName: 'memories', resourceId: memoryId, payload, error: msg })
      return jsonResponse({ success: false, memoryId, errors: [msg] }, 500)
    }

    if (!files || files.length === 0) {
      await recordCleanupSuccess(supabase, { tableName: 'memories', resourceId: memoryId })
      console.log(`[cleanup-memory-storage] no files | memory: ${memoryId}`)
      return jsonResponse({ success: true, memoryId, removed: 0 })
    }

    const paths = files
      .filter((f) => f.name && !f.name.endsWith('/'))
      .map((f) => `${memoryId}/${f.name}`)

    if (paths.length === 0) {
      await recordCleanupSuccess(supabase, { tableName: 'memories', resourceId: memoryId })
      return jsonResponse({ success: true, memoryId, removed: 0 })
    }

    const { error: removeError } = await supabase.storage
      .from(MEMORY_STORAGE_BUCKET)
      .remove(paths)

    if (removeError) {
      const msg = `remove failed: ${removeError.message}`
      console.error(
        `[cleanup-memory-storage] ${msg} | memory: ${memoryId} | paths: ${paths.join(', ')}`,
      )
      await recordCleanupFailure(supabase, { tableName: 'memories', resourceId: memoryId, payload, error: msg })
      return jsonResponse({ success: false, memoryId, errors: [msg] }, 500)
    }

    await recordCleanupSuccess(supabase, { tableName: 'memories', resourceId: memoryId })
    console.log(
      `[cleanup-memory-storage] removed ${paths.length} file(s) | memory: ${memoryId}`,
    )
    return jsonResponse({ success: true, memoryId, removed: paths.length })
  }

  return jsonResponse({ skipped: true, table: payload.table })
})
