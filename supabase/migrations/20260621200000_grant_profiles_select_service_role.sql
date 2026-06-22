-- Migration: allow service_role to SELECT profiles for admin Edge Functions
--
-- profiles was granted SELECT/UPDATE to authenticated only (20260617000000).
-- service_role bypasses RLS but still needs table-level SELECT for PostgREST
-- queries from Edge Functions (e.g. cleanup-incomplete-signups).

GRANT SELECT ON TABLE public.profiles TO service_role;
