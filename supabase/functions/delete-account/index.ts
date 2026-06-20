/**
 * Edge Function: delete-account
 *
 * Self-service account deletion. Called by the mobile app with the user's JWT.
 *
 * Deletion chain (do not duplicate storage cleanup here):
 *   auth.admin.deleteUser(user.id)
 *   → CASCADE DELETE public.profiles
 *   → pg_net trigger → cleanup-user-storage Edge Function
 *
 * Security:
 *   - Never accept userId from the request body — only delete the JWT owner.
 *   - Service role key stays in Edge Function env; never exposed to the client.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: JSON_HEADERS },
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[delete-account] Missing Supabase environment variables')
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: JSON_HEADERS },
    )
  }

  // Resolve the caller from their JWT — never trust a client-supplied user id.
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: JSON_HEADERS },
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error(`[delete-account] deleteUser failed | user: ${user.id} | ${deleteError.message}`)
    return new Response(
      JSON.stringify({ error: 'Could not delete account' }),
      { status: 500, headers: JSON_HEADERS },
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: JSON_HEADERS },
  )
})
