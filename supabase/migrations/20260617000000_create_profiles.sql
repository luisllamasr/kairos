-- =============================================================================
-- Migration: 20260617000000_create_profiles
-- Creates the profiles table, triggers, grants, and RLS policies.
--
-- Architecture decisions recorded here:
--   - profiles.id mirrors auth.users.id (no surrogate key)
--   - profile row is created automatically by trigger on signup
--   - incomplete profiles (username IS NULL) are the valid onboarding state
--   - username and display_name are nullable until onboarding completes
--
-- Incomplete profile cleanup contract (for future scheduled job):
--   Candidates: SELECT id FROM public.profiles
--               WHERE username IS NULL
--               AND created_at < NOW() - INTERVAL '30 days'
--   Action:     DELETE FROM auth.users WHERE id = $id  (service role)
--   Result:     ON DELETE CASCADE removes the profile automatically.
--   WARNING:    Never DELETE from profiles directly — that orphans auth.users.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id            UUID        NOT NULL,
  username      TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_pkey
    PRIMARY KEY (id),

  -- id shares the exact UUID from auth.users.
  -- CASCADE: deleting the auth user also deletes the profile.
  CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE,

  CONSTRAINT profiles_username_unique
    UNIQUE (username),

  -- Allowed characters: lowercase letters, digits, dots, underscores, hyphens.
  -- Length: 3–30 characters.
  -- NOTE: PostgreSQL uses POSIX regex — lookaheads are not supported.
  -- The "at least one alphanumeric" rule is enforced by the second constraint below.
  CONSTRAINT profiles_username_format
    CHECK (username ~ '^[a-z0-9._-]{3,30}$'),

  -- Blocks all-symbol usernames like "...", "___", "---".
  -- Together with profiles_username_format this is equivalent to:
  --   ^(?=.*[a-z0-9])[a-z0-9._-]{3,30}$
  CONSTRAINT profiles_username_has_alphanum
    CHECK (username ~ '[a-z0-9]'),

  -- display_name rules:
  --   - No leading or trailing whitespace stored (client must trim before sending).
  --   - No whitespace-only values (e.g. "   " is blocked by the trim equality).
  --   - Length 1–50 meaningful characters (Unicode-aware: counts codepoints).
  --   - Allows freely: accents, uppercase, spaces within the name, emoji.
  --   - NULL passes — the value is required only at the onboarding layer.
  CONSTRAINT profiles_display_name_valid
    CHECK (
      display_name = trim(display_name)
      AND length(display_name) BETWEEN 1 AND 50
    )
);


-- -----------------------------------------------------------------------------
-- GRANTS
-- Authenticated users may read all profiles and update their own row.
-- No INSERT grant: handled exclusively by the handle_new_user() trigger.
-- No DELETE grant: handled exclusively by the auth.users CASCADE.
-- -----------------------------------------------------------------------------

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;


-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read any profile row.
-- Required for: @mention resolution, participant lists, social discovery.
CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- A user can only update their own profile row.
-- USING:      restricts which rows the UPDATE statement can target.
-- WITH CHECK: prevents the client from changing the id to another user's id.
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- -----------------------------------------------------------------------------
-- FUNCTIONS
-- -----------------------------------------------------------------------------

-- Generic updated_at refresher.
-- Reusable: every future table that needs auto-updated_at gets its own
-- BEFORE UPDATE trigger pointing to this same function.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- Auto-creates a minimal profile row when a new Supabase auth user is registered.
-- Only inserts id — all other fields remain NULL until onboarding completes.
--
-- SECURITY DEFINER: runs with the definer's (postgres) privileges so it can
--   write to public.profiles when invoked from the auth schema context.
--
-- SET search_path = public: locks the search path to prevent search path
--   injection attacks, which are a known risk inside SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- TRIGGERS
-- -----------------------------------------------------------------------------

-- Refresh updated_at on every profile row update.
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create a profile row immediately after a new auth user is inserted.
-- Fires on auth.users (Supabase auth schema).
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
