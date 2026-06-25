-- Migration: memory storage cleanup on DELETE memories (pg_net → Edge Function)
--
-- When a memory entity is removed (last participant leaves, orphan purge, account
-- delete with no active participants, admin delete, daily maintain_orphaned_memories),
-- CASCADE removes memory_participants + memory_media metadata. Storage objects under
-- memories/{memory_id}/ must be removed asynchronously — same architecture as avatars.
--
-- Deletion chain:
--   DELETE public.memories
--   → CASCADE → memory_participants, memory_media
--   → AFTER DELETE trigger → net.http_post() (queued)
--   → transaction commits
--   → pg_net → cleanup-memory-storage Edge Function
--   → Storage API removes every file under {memory_id}/
--
-- Shared memories (M14+): memory row is NOT deleted while active participants
-- remain — trigger does not fire, Storage folder is preserved.
--
-- Vault setup: reuses service_role_key + supabase_url from migration 20260619000000.
-- Deploy Edge Function before validating:
--   npx supabase functions deploy cleanup-memory-storage

CREATE OR REPLACE FUNCTION public.trigger_storage_cleanup_on_memory_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text;
  _supabase_url     text;
BEGIN
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  IF _service_role_key IS NULL OR _supabase_url IS NULL THEN
    RAISE WARNING
      '[memory-storage-cleanup] Not configured — skipping cleanup for memory %. '
      'Ensure Vault secrets from migration 20260619000000 exist.',
      OLD.id;
    RETURN OLD;
  END IF;

  PERFORM net.http_post(
    url     := _supabase_url || '/functions/v1/cleanup-memory-storage',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body    := jsonb_build_object(
      'type',       'DELETE',
      'table',      'memories',
      'schema',     'public',
      'record',     NULL,
      'old_record', jsonb_build_object('id', OLD.id)
    )
  );

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_storage_cleanup_on_memory_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_memory_deleted_cleanup_storage ON public.memories;

CREATE TRIGGER on_memory_deleted_cleanup_storage
  AFTER DELETE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_storage_cleanup_on_memory_delete();
