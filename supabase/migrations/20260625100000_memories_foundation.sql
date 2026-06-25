-- Migration: memories foundation (M13 — squashed)
--
-- Product rules: docs/PROJECT.md — Shared memory model (M13 — locked)
-- Tables, RLS, helpers, transform, read/write RPCs, experience guards, transform cron.
-- Lifecycle maintenance (orphan purge, account delete) → 251200_memories_lifecycle.sql
-- Storage bucket → 251100_memories_storage.sql
-- Storage cleanup triggers → 251300_memories_storage_cleanup.sql

-- -----------------------------------------------------------------------------
-- 1. Enums + tables
-- -----------------------------------------------------------------------------

CREATE TYPE public.memory_participant_role AS ENUM ('organizer', 'participant');

CREATE TYPE public.memory_permission_policy AS ENUM ('all_participants', 'leader_only');

CREATE TABLE public.memories (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_experience_id        UUID,
  created_by                  UUID,
  organizer_id_at_transform   UUID,
  leader_id                   UUID,
  title                       TEXT NOT NULL,
  description                 TEXT,
  location_name               TEXT,
  location_latitude           DOUBLE PRECISION,
  location_longitude          DOUBLE PRECISION,
  happened_starts_at          TIMESTAMPTZ NOT NULL,
  happened_ends_at            TIMESTAMPTZ NOT NULL,
  transformed_at              TIMESTAMPTZ NOT NULL,
  visibility                  public.experience_visibility NOT NULL DEFAULT 'private',
  inspired_by_opportunity_id  UUID,
  edit_info_policy            public.memory_permission_policy NOT NULL DEFAULT 'all_participants',
  add_media_policy            public.memory_permission_policy NOT NULL DEFAULT 'all_participants',
  updated_by                  UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT memories_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE SET NULL,

  CONSTRAINT memories_organizer_at_transform_fkey
    FOREIGN KEY (organizer_id_at_transform) REFERENCES public.profiles (id) ON DELETE SET NULL,

  CONSTRAINT memories_leader_id_fkey
    FOREIGN KEY (leader_id) REFERENCES public.profiles (id) ON DELETE SET NULL,

  CONSTRAINT memories_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.profiles (id) ON DELETE SET NULL,

  CONSTRAINT memories_title_valid
    CHECK (char_length(trim(title)) BETWEEN 1 AND 120),

  CONSTRAINT memories_description_length
    CHECK (description IS NULL OR char_length(description) <= 2000),

  CONSTRAINT memories_location_name_length
    CHECK (location_name IS NULL OR char_length(trim(location_name)) <= 200),

  CONSTRAINT memories_location_coordinates_pair
    CHECK (
      (location_latitude IS NULL AND location_longitude IS NULL)
      OR (location_latitude IS NOT NULL AND location_longitude IS NOT NULL)
    ),

  CONSTRAINT memories_location_latitude_range
    CHECK (location_latitude IS NULL OR (location_latitude >= -90 AND location_latitude <= 90)),

  CONSTRAINT memories_location_longitude_range
    CHECK (location_longitude IS NULL OR (location_longitude >= -180 AND location_longitude <= 180)),

  CONSTRAINT memories_time_order
    CHECK (happened_ends_at > happened_starts_at)
);

COMMENT ON TABLE public.memories IS
  'Shared past moments. One row per transformed experience; personal layer in memory_participants.';

CREATE INDEX memories_leader_idx ON public.memories (leader_id) WHERE leader_id IS NOT NULL;
CREATE INDEX memories_happened_starts_idx ON public.memories (happened_starts_at DESC);

CREATE TABLE public.memory_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id       UUID NOT NULL,
  user_id         UUID,
  role            public.memory_participant_role NOT NULL DEFAULT 'participant',
  personal_note   TEXT,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at         TIMESTAMPTZ,

  CONSTRAINT memory_participants_memory_fkey
    FOREIGN KEY (memory_id) REFERENCES public.memories (id) ON DELETE CASCADE,

  CONSTRAINT memory_participants_user_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE SET NULL,

  CONSTRAINT memory_participants_personal_note_length
    CHECK (personal_note IS NULL OR char_length(personal_note) <= 1000)
);

CREATE UNIQUE INDEX memory_participants_memory_user_uidx
  ON public.memory_participants (memory_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX memory_participants_user_active_idx
  ON public.memory_participants (user_id, memory_id)
  WHERE user_id IS NOT NULL AND left_at IS NULL;

CREATE INDEX memory_participants_memory_idx
  ON public.memory_participants (memory_id);

COMMENT ON CONSTRAINT memory_participants_memory_fkey ON public.memory_participants IS
  'Deleting a memory removes all participant rows (distinct from leave → left_at).';

CREATE TABLE public.memory_media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id           UUID NOT NULL,
  uploaded_by_user_id UUID,
  storage_path        TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  byte_size           INTEGER,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT memory_media_memory_fkey
    FOREIGN KEY (memory_id) REFERENCES public.memories (id) ON DELETE CASCADE,

  CONSTRAINT memory_media_uploaded_by_fkey
    FOREIGN KEY (uploaded_by_user_id) REFERENCES public.profiles (id) ON DELETE SET NULL,

  CONSTRAINT memory_media_storage_path_unique UNIQUE (storage_path),

  CONSTRAINT memory_media_mime_type_valid
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE INDEX memory_media_memory_idx ON public.memory_media (memory_id, sort_order, created_at);

COMMENT ON CONSTRAINT memory_media_memory_fkey ON public.memory_media IS
  'Deleting a memory removes all media metadata rows. Storage cleanup is separate.';

CREATE TRIGGER set_memories_updated_at
  BEFORE UPDATE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Grants + RLS
-- -----------------------------------------------------------------------------

GRANT SELECT ON TABLE public.memories TO authenticated;
GRANT SELECT ON TABLE public.memory_participants TO authenticated;
GRANT SELECT ON TABLE public.memory_media TO authenticated;

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_media ENABLE ROW LEVEL SECURITY;

-- Writes via SECURITY DEFINER RPCs only. Policies created after helpers (section 3).

-- -----------------------------------------------------------------------------
-- 3. Internal helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_memory_participant(
  p_memory_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_participants mp
    WHERE mp.memory_id = p_memory_id
      AND mp.user_id = p_user_id
      AND mp.left_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_memory_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_memory_participant(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.memory_has_active_participants(p_memory_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memory_participants mp
    WHERE mp.memory_id = p_memory_id
      AND mp.user_id IS NOT NULL
      AND mp.left_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.memory_has_active_participants(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.elect_memory_leader(
  p_memory_id uuid,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mp.user_id
  FROM public.memory_participants mp
  WHERE mp.memory_id = p_memory_id
    AND mp.user_id IS NOT NULL
    AND mp.left_at IS NULL
    AND (p_exclude_user_id IS NULL OR mp.user_id <> p_exclude_user_id)
  ORDER BY mp.joined_at ASC, mp.user_id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.elect_memory_leader(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.purge_memory_if_orphaned(p_memory_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.memory_has_active_participants(p_memory_id) THEN
    RETURN;
  END IF;

  DELETE FROM public.memories WHERE id = p_memory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_memory_if_orphaned(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.transfer_memory_leadership(
  p_memory_id uuid,
  p_new_leader_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.memory_participants mp
    WHERE mp.memory_id = p_memory_id
      AND mp.user_id = p_new_leader_id
      AND mp.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid leader';
  END IF;

  UPDATE public.memories
  SET leader_id = p_new_leader_id
  WHERE id = p_memory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_memory_leadership(uuid, uuid) FROM PUBLIC;

CREATE POLICY "memories_select_active_participant"
  ON public.memories
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(id));

CREATE POLICY "memory_participants_select_fellow"
  ON public.memory_participants
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(memory_id));

CREATE POLICY "memory_media_select_participant"
  ON public.memory_media
  FOR SELECT
  TO authenticated
  USING (public.is_active_memory_participant(memory_id));

-- -----------------------------------------------------------------------------
-- 4. Transform experience → memory
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transform_experience_to_memory(p_experience_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp         public.experiences%ROWTYPE;
  v_memory_id   uuid;
  v_now         timestamptz := NOW();
BEGIN
  SELECT * INTO v_exp
  FROM public.experiences e
  WHERE e.id = p_experience_id
    AND e.status = 'planned'
    AND e.transform_at <= v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.memories (
    source_experience_id,
    created_by,
    organizer_id_at_transform,
    leader_id,
    title,
    description,
    location_name,
    location_latitude,
    location_longitude,
    happened_starts_at,
    happened_ends_at,
    transformed_at,
    visibility,
    inspired_by_opportunity_id,
    edit_info_policy,
    add_media_policy,
    updated_by
  )
  VALUES (
    v_exp.id,
    v_exp.created_by,
    v_exp.organizer_id,
    v_exp.organizer_id,
    v_exp.title,
    v_exp.description,
    v_exp.location_name,
    v_exp.location_latitude,
    v_exp.location_longitude,
    v_exp.starts_at,
    v_exp.ends_at,
    v_now,
    v_exp.visibility,
    v_exp.inspired_by_opportunity_id,
    'all_participants',
    'all_participants',
    v_exp.organizer_id
  )
  RETURNING id INTO v_memory_id;

  INSERT INTO public.memory_participants (memory_id, user_id, role, joined_at)
  VALUES (v_memory_id, v_exp.organizer_id, 'organizer', v_now);

  DELETE FROM public.experiences WHERE id = v_exp.id;

  RETURN v_memory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transform_experience_to_memory(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.transform_due_experiences()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp_id uuid;
  v_count  integer := 0;
BEGIN
  FOR v_exp_id IN
    SELECT e.id
    FROM public.experiences e
    WHERE e.status = 'planned'
      AND e.transform_at <= NOW()
    ORDER BY e.transform_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.transform_experience_to_memory(v_exp_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.transform_due_experiences() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ensure_experience_transformed(p_experience_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.experiences e
    WHERE e.id = p_experience_id
      AND e.organizer_id = v_me
  ) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  RETURN public.transform_experience_to_memory(p_experience_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_experience_transformed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_experience_transformed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.experience_min_starts_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOW() + interval '10 minutes';
$$;

REVOKE ALL ON FUNCTION public.experience_min_starts_at() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.transform_my_due_experiences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_exp_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  FOR v_exp_id IN
    SELECT e.id
    FROM public.experiences e
    WHERE e.organizer_id = v_me
      AND e.status = 'planned'
      AND e.transform_at <= NOW()
    FOR UPDATE OF e
  LOOP
    PERFORM public.transform_experience_to_memory(v_exp_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.transform_my_due_experiences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transform_my_due_experiences() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Experience guards (future-start validation)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_experience(
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_starts_at            timestamptz,
  p_ends_at              timestamptz,
  p_location_latitude    double precision DEFAULT NULL,
  p_location_longitude   double precision DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid;
  v_id  uuid;
  v_title text;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'dates required';
  END IF;

  IF p_starts_at < public.experience_min_starts_at() THEN
    RAISE EXCEPTION 'starts in past';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid dates';
  END IF;

  v_title := trim(p_title);
  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'invalid title';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 2000 THEN
    RAISE EXCEPTION 'invalid description';
  END IF;

  IF p_location_name IS NOT NULL AND char_length(trim(p_location_name)) > 200 THEN
    RAISE EXCEPTION 'invalid location name';
  END IF;

  IF (p_location_latitude IS NULL) <> (p_location_longitude IS NULL) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  IF p_location_latitude IS NOT NULL AND (
    p_location_latitude < -90 OR p_location_latitude > 90
    OR p_location_longitude < -180 OR p_location_longitude > 180
  ) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  INSERT INTO public.experiences (
    created_by,
    organizer_id,
    title,
    description,
    location_name,
    location_latitude,
    location_longitude,
    starts_at,
    ends_at,
    visibility,
    status,
    transform_at
  )
  VALUES (
    v_me,
    v_me,
    v_title,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_location_name), ''),
    p_location_latitude,
    p_location_longitude,
    p_starts_at,
    p_ends_at,
    'private',
    'planned',
    public.compute_experience_transform_at(p_ends_at)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_experience(
  p_id                   uuid,
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_starts_at            timestamptz,
  p_ends_at              timestamptz,
  p_location_latitude    double precision DEFAULT NULL,
  p_location_longitude   double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid;
  v_title text;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'dates required';
  END IF;

  IF p_starts_at < public.experience_min_starts_at() THEN
    RAISE EXCEPTION 'starts in past';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid dates';
  END IF;

  v_title := trim(p_title);
  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'invalid title';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 2000 THEN
    RAISE EXCEPTION 'invalid description';
  END IF;

  IF p_location_name IS NOT NULL AND char_length(trim(p_location_name)) > 200 THEN
    RAISE EXCEPTION 'invalid location name';
  END IF;

  IF (p_location_latitude IS NULL) <> (p_location_longitude IS NULL) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  IF p_location_latitude IS NOT NULL AND (
    p_location_latitude < -90 OR p_location_latitude > 90
    OR p_location_longitude < -180 OR p_location_longitude > 180
  ) THEN
    RAISE EXCEPTION 'invalid location coordinates';
  END IF;

  UPDATE public.experiences
  SET
    title = v_title,
    description = NULLIF(trim(p_description), ''),
    location_name = NULLIF(trim(p_location_name), ''),
    location_latitude = p_location_latitude,
    location_longitude = p_location_longitude,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    transform_at = public.compute_experience_transform_at(p_ends_at)
  WHERE id = p_id
    AND organizer_id = v_me
    AND status = 'planned'
    AND transform_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_my_friends()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.friendships f
  WHERE f.status = 'accepted'
    AND (f.user_low_id = auth.uid() OR f.user_high_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.count_my_friends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_my_friends() TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Read RPCs (pure SQL, STABLE, SECURITY DEFINER — no side effects)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_my_memories(p_search text DEFAULT NULL)
RETURNS TABLE (
  id                 uuid,
  title              text,
  location_name      text,
  happened_starts_at timestamptz,
  happened_ends_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.title,
    m.location_name,
    m.happened_starts_at,
    m.happened_ends_at
  FROM public.memories m
  JOIN public.memory_participants mp
    ON mp.memory_id = m.id
   AND mp.user_id = auth.uid()
   AND mp.left_at IS NULL
  WHERE p_search IS NULL
     OR btrim(p_search) = ''
     OR m.title ILIKE '%' || btrim(p_search) || '%'
  ORDER BY m.happened_starts_at DESC, m.transformed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_my_memories(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_memories(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_memory(p_id uuid)
RETURNS TABLE (
  id                        uuid,
  title                     text,
  description               text,
  location_name             text,
  location_latitude         double precision,
  location_longitude        double precision,
  happened_starts_at        timestamptz,
  happened_ends_at          timestamptz,
  transformed_at            timestamptz,
  leader_id                 uuid,
  edit_info_policy          public.memory_permission_policy,
  add_media_policy          public.memory_permission_policy,
  my_personal_note          text,
  am_leader                 boolean,
  updated_at                timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.title,
    m.description,
    m.location_name,
    m.location_latitude,
    m.location_longitude,
    m.happened_starts_at,
    m.happened_ends_at,
    m.transformed_at,
    m.leader_id,
    m.edit_info_policy,
    m.add_media_policy,
    mp.personal_note,
    (m.leader_id = auth.uid()),
    m.updated_at
  FROM public.memories m
  JOIN public.memory_participants mp
    ON mp.memory_id = m.id
   AND mp.user_id = auth.uid()
   AND mp.left_at IS NULL
  WHERE m.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.get_memory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_memory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_my_memories()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.memory_participants mp
  JOIN public.memories m ON m.id = mp.memory_id
  WHERE mp.user_id = auth.uid()
    AND mp.left_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.count_my_memories() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.list_memory_participants(p_memory_id uuid)
RETURNS TABLE (
  participant_id uuid,
  user_id        uuid,
  role           public.memory_participant_role,
  joined_at      timestamptz,
  left_at        timestamptz,
  username       text,
  display_name   text,
  avatar_url     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mp.id,
    mp.user_id,
    mp.role,
    mp.joined_at,
    mp.left_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.memory_participants mp
  LEFT JOIN public.profiles p ON p.id = mp.user_id
  WHERE mp.memory_id = p_memory_id
    AND public.is_active_memory_participant(p_memory_id)
  ORDER BY mp.joined_at ASC, mp.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_memory_participants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_memory_participants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_memory_media(p_memory_id uuid)
RETURNS TABLE (
  id                  uuid,
  storage_path        text,
  mime_type           text,
  byte_size           integer,
  sort_order          integer,
  created_at          timestamptz,
  uploaded_by_user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mm.id,
    mm.storage_path,
    mm.mime_type,
    mm.byte_size,
    mm.sort_order,
    mm.created_at,
    mm.uploaded_by_user_id
  FROM public.memory_media mm
  WHERE mm.memory_id = p_memory_id
    AND public.is_active_memory_participant(p_memory_id)
  ORDER BY mm.sort_order ASC, mm.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_memory_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_memory_media(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Write RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_memory_info(
  p_id                   uuid,
  p_title                text,
  p_description          text,
  p_location_name        text,
  p_expected_updated_at  timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid;
  v_title text;
  v_mem   public.memories%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_active_memory_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT * INTO v_mem FROM public.memories m WHERE m.id = p_id FOR UPDATE;

  IF v_mem.edit_info_policy = 'leader_only' AND v_mem.leader_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_mem.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'conflict';
  END IF;

  v_title := trim(p_title);
  IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'invalid title';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 2000 THEN
    RAISE EXCEPTION 'invalid description';
  END IF;

  IF p_location_name IS NOT NULL AND char_length(trim(p_location_name)) > 200 THEN
    RAISE EXCEPTION 'invalid location name';
  END IF;

  UPDATE public.memories
  SET
    title = v_title,
    description = NULLIF(trim(p_description), ''),
    location_name = NULLIF(trim(p_location_name), ''),
    updated_by = v_me
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_memory_info(uuid, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_memory_info(uuid, text, text, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_memory_note(
  p_id   uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'invalid note';
  END IF;

  UPDATE public.memory_participants mp
  SET personal_note = NULLIF(trim(p_note), '')
  WHERE mp.memory_id = p_id
    AND mp.user_id = v_me
    AND mp.left_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_memory_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_memory_note(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_memory(
  p_id             uuid,
  p_new_leader_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me              uuid;
  v_mem             public.memories%ROWTYPE;
  v_other_active    integer;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_active_memory_participant(p_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  SELECT * INTO v_mem FROM public.memories m WHERE m.id = p_id FOR UPDATE;

  SELECT COUNT(*) INTO v_other_active
  FROM public.memory_participants mp
  WHERE mp.memory_id = p_id
    AND mp.user_id IS NOT NULL
    AND mp.user_id <> v_me
    AND mp.left_at IS NULL;

  IF v_mem.leader_id = v_me AND v_other_active > 0 THEN
    IF p_new_leader_id IS NULL THEN
      RAISE EXCEPTION 'leader required';
    END IF;
    PERFORM public.transfer_memory_leadership(p_id, p_new_leader_id);
  END IF;

  UPDATE public.memory_participants
  SET left_at = NOW()
  WHERE memory_id = p_id
    AND user_id = v_me
    AND left_at IS NULL;

  PERFORM public.purge_memory_if_orphaned(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_memory(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_memory(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_memory_photo(
  p_memory_id   uuid,
  p_media_id    uuid,
  p_storage_path text,
  p_mime_type   text,
  p_byte_size   integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_active_memory_participant(p_memory_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memories m
    WHERE m.id = p_memory_id
      AND (
        m.add_media_policy = 'all_participants'
        OR m.leader_id = v_me
      )
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'invalid mime type';
  END IF;

  IF p_storage_path IS NULL OR p_storage_path <> (p_memory_id::text || '/' || p_media_id::text || '.' ||
    CASE
      WHEN p_mime_type = 'image/png' THEN 'png'
      WHEN p_mime_type = 'image/webp' THEN 'webp'
      ELSE 'jpg'
    END) THEN
    RAISE EXCEPTION 'invalid storage path';
  END IF;

  INSERT INTO public.memory_media (
    id,
    memory_id,
    uploaded_by_user_id,
    storage_path,
    mime_type,
    byte_size
  )
  VALUES (
    p_media_id,
    p_memory_id,
    v_me,
    p_storage_path,
    p_mime_type,
    p_byte_size
  );

  RETURN p_media_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_memory_photo(uuid, uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_memory_photo(uuid, uuid, text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_memory_photo(p_media_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid;
  v_row  public.memory_media%ROWTYPE;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.memory_media mm
  WHERE mm.id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.is_active_memory_participant(v_row.memory_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF v_row.uploaded_by_user_id IS DISTINCT FROM v_me THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.memories m
      WHERE m.id = v_row.memory_id AND m.leader_id = v_me
    ) THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
  END IF;

  DELETE FROM public.memory_media WHERE id = p_media_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_memory_photo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_memory_photo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_orphaned_memories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT m.id
    FROM public.memories m
    WHERE NOT public.memory_has_active_participants(m.id)
  LOOP
    DELETE FROM public.memories WHERE id = v_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_orphaned_memories() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 8. Transform cron
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  _job_id bigint;
BEGIN
  SELECT jobid INTO _job_id FROM cron.job WHERE jobname = 'transform-due-experiences';
  IF _job_id IS NOT NULL THEN PERFORM cron.unschedule(_job_id); END IF;
END;
$$;

SELECT cron.schedule(
  'transform-due-experiences',
  '*/15 * * * *',
  $$SELECT public.transform_due_experiences()$$
);
