-- Migration: fix send_experience_message lint (unused v_exp_id removed in 271100)

CREATE OR REPLACE FUNCTION public.send_experience_message(
  p_experience_id uuid,
  p_body          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         uuid;
  v_body       text;
  v_message_id uuid;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_experience_participant(p_experience_id, v_me) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  PERFORM 1
  FROM public.experiences e
  WHERE e.id = p_experience_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  IF NOT public.experience_user_can(p_experience_id, 'chat_write', v_me) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_body := trim(p_body);
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'invalid body';
  END IF;

  INSERT INTO public.experience_messages (experience_id, author_id, body)
  VALUES (p_experience_id, v_me, v_body)
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_experience_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_experience_message(uuid, text) TO authenticated;
