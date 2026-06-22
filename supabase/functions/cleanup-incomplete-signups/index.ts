/**
 * Edge Function: cleanup-incomplete-signups
 *
 * Removes abandoned auth users whose profile never completed onboarding.
 *
 * Candidate rule:
 *   public.profiles.username IS NULL
 *   AND created_at older than INCOMPLETE_SIGNUP_MIN_AGE_DAYS (default 3)
 *
 * Deletion chain (same as delete-account):
 *   auth.admin.deleteUser(id)
 *   → CASCADE DELETE public.profiles
 *   → pg_net trigger → cleanup-user-storage Edge Function
 *
 * Security:
 *   - Service role only (pg_cron / manual Dashboard invoke).
 *   - Never callable by client JWT.
 *
 * Testing:
 *   • GET/POST ?dry_run=1 — list candidates, no deletes
 *   • Backdate a test row: UPDATE profiles SET created_at = NOW() - INTERVAL '4 days' WHERE id = '...'
 *   • Invoke without dry_run from Dashboard → Edge Functions → cleanup-incomplete-signups
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const DEFAULT_MIN_AGE_DAYS = 3
const BATCH_LIMIT = 100

interface Candidate {
  id: string
  created_at: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''

  if (!serviceRoleKey || !supabaseUrl || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === '1'

  const minAgeDaysParam = url.searchParams.get('min_age_days')
  const minAgeDays = minAgeDaysParam
    ? Math.max(0, parseInt(minAgeDaysParam, 10) || DEFAULT_MIN_AGE_DAYS)
    : parseInt(Deno.env.get('INCOMPLETE_SIGNUP_MIN_AGE_DAYS') ?? String(DEFAULT_MIN_AGE_DAYS), 10)

  const cutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000).toISOString()

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: candidates, error: queryError } = await supabaseAdmin
    .from('profiles')
    .select('id, created_at')
    .is('username', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (queryError) {
    console.error(`[cleanup-incomplete-signups] query failed: ${queryError.message}`)
    return new Response(
      JSON.stringify({ error: 'Query failed' }),
      { status: 500, headers: JSON_HEADERS },
    )
  }

  const rows = (candidates ?? []) as Candidate[]

  if (dryRun) {
    return new Response(
      JSON.stringify({
        dry_run: true,
        min_age_days: minAgeDays,
        cutoff,
        count: rows.length,
        candidates: rows,
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  }

  const deleted: string[] = []
  const failed: { id: string; message: string }[] = []

  for (const row of rows) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(row.id)

    if (deleteError) {
      // Idempotent: user already removed between query and delete.
      if (/not found|User not found/i.test(deleteError.message)) {
        deleted.push(row.id)
        continue
      }
      console.error(
        `[cleanup-incomplete-signups] deleteUser failed | user: ${row.id} | ${deleteError.message}`,
      )
      failed.push({ id: row.id, message: deleteError.message })
      continue
    }

    console.log(`[cleanup-incomplete-signups] deleted user ${row.id}`)
    deleted.push(row.id)
  }

  return new Response(
    JSON.stringify({
      min_age_days: minAgeDays,
      cutoff,
      deleted_count: deleted.length,
      failed_count: failed.length,
      deleted,
      failed,
    }),
    { status: failed.length > 0 ? 207 : 200, headers: JSON_HEADERS },
  )
})
