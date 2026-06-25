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

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

    const { error: removeError } = await supabase.storage
      .from(MEMORY_STORAGE_BUCKET)
      .remove([storagePath])

    if (removeError) {
      const msg = `remove failed: ${removeError.message}`
      console.error(`[cleanup-memory-storage] ${msg} | path: ${storagePath}`)
      return jsonResponse({ success: false, storagePath, errors: [msg] }, 500)
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
      return jsonResponse({ success: false, memoryId, errors: [msg] }, 500)
    }

    if (!files || files.length === 0) {
      console.log(`[cleanup-memory-storage] no files | memory: ${memoryId}`)
      return jsonResponse({ success: true, memoryId, removed: 0 })
    }

    const paths = files
      .filter((f) => f.name && !f.name.endsWith('/'))
      .map((f) => `${memoryId}/${f.name}`)

    if (paths.length === 0) {
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
      return jsonResponse({ success: false, memoryId, errors: [msg] }, 500)
    }

    console.log(
      `[cleanup-memory-storage] removed ${paths.length} file(s) | memory: ${memoryId}`,
    )
    return jsonResponse({ success: true, memoryId, removed: paths.length })
  }

  return jsonResponse({ skipped: true, table: payload.table })
})
