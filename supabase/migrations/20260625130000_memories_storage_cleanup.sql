-- Migration: memories storage cleanup (M13 + M13.5 — squashed)
--
-- Server-side Storage lifecycle via pg_net → cleanup-memory-storage Edge Function.
--
-- Whole memory:
--   DELETE public.memories → trigger → folder cleanup (memories/{memory_id}/)
--
-- Single photo:
--   DELETE public.memory_media → trigger → file cleanup (storage_path)
--
-- Vault setup: reuses service_role_key + supabase_url from migration 20260619000000.
-- Deploy Edge Function before validating:
--   npx supabase functions deploy cleanup-memory-storage

-- -----------------------------------------------------------------------------
-- 1. DELETE memories → folder cleanup
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 2. DELETE memory_media → single-file cleanup
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_storage_cleanup_on_memory_media_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text;
  _supabase_url     text;
BEGIN
  IF OLD.storage_path IS NULL OR btrim(OLD.storage_path) = '' THEN
    RETURN OLD;
  END IF;

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
      '[memory-media-storage-cleanup] Not configured — skipping cleanup for path %. '
      'Ensure Vault secrets from migration 20260619000000 exist.',
      OLD.storage_path;
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
      'table',      'memory_media',
      'schema',     'public',
      'record',     NULL,
      'old_record', jsonb_build_object(
        'id',           OLD.id,
        'memory_id',    OLD.memory_id,
        'storage_path', OLD.storage_path
      )
    )
  );

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_storage_cleanup_on_memory_media_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_memory_media_deleted_cleanup_storage ON public.memory_media;

CREATE TRIGGER on_memory_media_deleted_cleanup_storage
  AFTER DELETE ON public.memory_media
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_storage_cleanup_on_memory_media_delete();
