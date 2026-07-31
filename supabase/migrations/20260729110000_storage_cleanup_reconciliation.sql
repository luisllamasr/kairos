-- Migration: storage cleanup reconciliation (post-M15 production-readiness audit)
--
-- cleanup-user-storage and cleanup-memory-storage run as fire-and-forget pg_net
-- calls dispatched after the DB row that triggered them is already gone. On
-- failure they only console.error and return 500 -- nothing ever revisits a
-- failed Storage delete, so orphaned files can accumulate silently, forever.
--
-- This migration adds a durable failure ledger + a retry cron. Responsibility
-- split, chosen to avoid double-write races between the cron and the functions:
--   - Both Edge Functions are the ONLY writers of a row's mutable state
--     (attempt_count, last_error, next_retry_at, status). On failure they
--     upsert; on success (only if a prior-failure row exists) they resolve it.
--   - The retry job below ONLY selects due rows and re-fires the exact stored
--     payload -- it never writes to the ledger itself.
--
-- Known simplification: if an Edge Function invocation is dispatched but never
-- executes at all (no response whatsoever -- e.g. a platform-level outage),
-- the row's next_retry_at stays in the past and it gets re-fired every cron
-- tick indefinitely rather than backing off further or ever reaching
-- `failed_permanently`. Accepted for now: the underlying cleanup is
-- idempotent, so this is a safe (if noisy) fallback, and this failure mode is
-- far rarer than an ordinary Storage API error, which IS handled correctly.
--
-- Backoff: up to 4 retries after the initial failure (attempt_count 1 -> 5),
-- at +15m, +1h, +6h, +24h, then `failed_permanently` -- durable and queryable
-- in this table. Not wired to alerting yet; that's tracked separately under
-- the still-open observability work (Sentry/PostHog).

CREATE TABLE public.storage_cleanup_failures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name  text NOT NULL CHECK (function_name IN ('cleanup-user-storage', 'cleanup-memory-storage')),
  table_name     text NOT NULL,
  resource_id    text NOT NULL,
  payload        jsonb NOT NULL,
  attempt_count  integer NOT NULL DEFAULT 1,
  last_error     text NOT NULL,
  next_retry_at  timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'failed_permanently')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  UNIQUE (function_name, table_name, resource_id)
);

COMMENT ON TABLE public.storage_cleanup_failures IS
  'Reconciliation ledger for failed async Storage cleanup calls (cleanup-user-storage, cleanup-memory-storage). Service-role only -- no client access, no RPC surface. Query directly via SQL Editor to check for failed_permanently rows until this is wired into observability tooling.';

-- Internal reconciliation ledger only -- no client should ever read or write
-- this. Written and read only by the Edge Functions and the retry cron below,
-- both via the service role, which bypasses RLS.
ALTER TABLE public.storage_cleanup_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storage_cleanup_failures FROM anon, authenticated;

CREATE INDEX storage_cleanup_failures_due_idx
  ON public.storage_cleanup_failures (next_retry_at)
  WHERE status = 'pending';

-- Wrapper so pg_cron can invoke the retry sweep without hardcoding secrets --
-- same Vault pattern as trigger_incomplete_signup_cleanup() (20260620100000).
CREATE OR REPLACE FUNCTION public.retry_storage_cleanup_failures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text;
  _supabase_url     text;
  _failure          record;
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
      '[storage-cleanup-retry] Vault not configured -- skipping. '
      'Run vault.create_secret setup documented in migration 20260619000000.';
    RETURN;
  END IF;

  FOR _failure IN
    SELECT id, function_name, payload
    FROM public.storage_cleanup_failures
    WHERE status = 'pending'
      AND next_retry_at <= NOW()
    ORDER BY next_retry_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Re-send the exact original webhook payload. Both target functions are
    -- idempotent (re-listing an already-empty folder is a safe no-op), so a
    -- retry is safe even if a prior attempt partially succeeded.
    PERFORM net.http_post(
      url     := _supabase_url || '/functions/v1/' || _failure.function_name,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      ),
      body    := _failure.payload
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_storage_cleanup_failures() FROM PUBLIC;

DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id FROM cron.job WHERE jobname = 'retry-storage-cleanup-failures';
  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;
END;
$$;

-- Same 15-minute cadence as the existing transform/purge lifecycle cron.
SELECT cron.schedule(
  'retry-storage-cleanup-failures',
  '*/15 * * * *',
  $$SELECT public.retry_storage_cleanup_failures()$$
);
