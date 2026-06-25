/**
 * Edge Function: cleanup-memory-storage
 *
 * Called by the pg_net trigger `on_memory_deleted_cleanup_storage` (migration
 * 20260625190000). Removes all files under memories/{memory_id}/ when a memory
 * row is deleted.
 *
 * Runs OUTSIDE the database transaction (pg_net queues HTTP after commit).
 * A cleanup failure never blocks or rolls back memory deletion.
 *
 * ── Trigger flow ─────────────────────────────────────────────────────────────
 *   DELETE public.memories  (leave last participant, orphan purge, admin, …)
 *   → CASCADE deletes memory_participants + memory_media metadata
 *   → AFTER DELETE trigger → net.http_post() (queued, async)
 *   → transaction commits
 *   → pg_net worker POSTs to this function
 *   → Storage API deletes every object under {memory_id}/
 *
 * ── Shared memories (M14+) ─────────────────────────────────────────────────
 *   Memory row is only deleted when no active participants remain. While others
 *   stay, the row (and Storage folder) are kept. Account delete on a shared
 *   memory tombstones the user but preserves the memory for active participants.
 *
 * ── Single photo delete ──────────────────────────────────────────────────────
 *   delete_memory_photo RPC + client remove() handles one file at a time.
 *   This function is for entity deletion only (whole memory folder).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MEMORY_STORAGE_BUCKET = 'memories'

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Record<string, unknown> | null
  old_record: Record<string, unknown> | null
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
    return new Response(
      JSON.stringify({ skipped: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const memoryId = payload.old_record.id as string | undefined
  if (!memoryId) {
    return new Response('old_record.id missing', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  )

  const { data: files, error: listError } = await supabase.storage
    .from(MEMORY_STORAGE_BUCKET)
    .list(memoryId)

  if (listError) {
    const msg = `list failed: ${listError.message}`
    console.error(`[cleanup-memory-storage] ${msg} | memory: ${memoryId}`)
    return new Response(
      JSON.stringify({ success: false, memoryId, errors: [msg] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!files || files.length === 0) {
    console.log(`[cleanup-memory-storage] no files | memory: ${memoryId}`)
    return new Response(
      JSON.stringify({ success: true, memoryId, removed: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const paths = files
    .filter((f) => f.name && !f.name.endsWith('/'))
    .map((f) => `${memoryId}/${f.name}`)

  if (paths.length === 0) {
    return new Response(
      JSON.stringify({ success: true, memoryId, removed: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { error: removeError } = await supabase.storage
    .from(MEMORY_STORAGE_BUCKET)
    .remove(paths)

  if (removeError) {
    const msg = `remove failed: ${removeError.message}`
    console.error(
      `[cleanup-memory-storage] ${msg} | memory: ${memoryId} | paths: ${paths.join(', ')}`,
    )
    return new Response(
      JSON.stringify({ success: false, memoryId, errors: [msg] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.log(
    `[cleanup-memory-storage] removed ${paths.length} file(s) | memory: ${memoryId}`,
  )

  return new Response(
    JSON.stringify({ success: true, memoryId, removed: paths.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
