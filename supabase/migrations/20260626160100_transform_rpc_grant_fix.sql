-- Fix: transform_experience_to_memory must stay internal (cron / ensure_experience_transformed only).

REVOKE EXECUTE ON FUNCTION public.transform_experience_to_memory(uuid) FROM authenticated;
