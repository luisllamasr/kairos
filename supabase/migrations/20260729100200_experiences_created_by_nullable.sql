-- Migration: make experiences.created_by nullable (post-M15 production-readiness audit)
--
-- created_by is an immutable audit field only -- never read by the client, and
-- explicitly excluded from permission checks (see docs/SECURITY.md: those use
-- organizer_id / leader_id only). Its FK was changed from ON DELETE CASCADE to
-- ON DELETE SET NULL in 20260626100000 so that a shared experience survives its
-- original creator later deleting their account -- but the column's NOT NULL
-- constraint was never relaxed to match, unlike organizer_id, which got the
-- correct treatment two lines below it in that same migration.
--
-- Effect of the bug: deleting the account of anyone who ever created a shared
-- experience that other participants still hold onto crashes account deletion
-- outright (NOT NULL violation when the FK tries to null the column).
--
-- Fix mirrors organizer_id's existing nullable pattern, and matches how every
-- other identity column in the schema already handles a referenced user being
-- deleted (memories.*, memory_participants.user_id, experience_messages.author_id)
-- -- no new "Deleted User" sentinel mechanism needed. If a future feature ever
-- surfaces created_by in the UI, it should resolve a NULL value the same way
-- messageAuthorLabel() already does for chat authorship.

ALTER TABLE public.experiences
  ALTER COLUMN created_by DROP NOT NULL;

COMMENT ON COLUMN public.experiences.created_by IS
  'Immutable audit trail of who originally created this experience. Not used for permission checks (see organizer_id) and not surfaced to clients today. NULL if the creator later deleted their account.';
