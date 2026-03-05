-- ================================================================
-- ADMIN: Създаване на auth потребител директно от SQL (без service key)
-- ================================================================
-- SECURITY DEFINER = изпълнява се с postgres права (може да пише в auth.*)
-- _is_admin() = само ventsi.vutov@gmail.com може да извика функцията
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email    text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, extensions, public, pg_catalog
AS $$
DECLARE
  v_user_id        uuid;
  v_encrypted_pw   text;
BEGIN
  -- Само admin може да извика
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  -- Ако потребителят вече съществува → върни id-то
  SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(p_email));
  IF v_user_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', true,
      'user_id', v_user_id,
      'email',   p_email,
      'message', 'Потребителят вече съществува'
    );
  END IF;

  -- Хеширай паролата с bcrypt (pgcrypto)
  v_user_id      := gen_random_uuid();
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  -- Създай auth потребител
  INSERT INTO auth.users (
    id, instance_id,
    email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    role, aud,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_email)),
    v_encrypted_pw,
    now(),   -- потвърден веднага, без имейл
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated', 'authenticated',
    now(), now(),
    '', '', '', ''
  );

  -- Създай identity запис (нужен за login)
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data,
    provider, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    lower(trim(p_email)),
    json_build_object('sub', v_user_id::text, 'email', lower(trim(p_email)))::jsonb,
    'email',
    now(), now(), now()
  );

  RETURN json_build_object(
    'success', true,
    'user_id', v_user_id,
    'email',   p_email,
    'message', 'Потребителят е създаден успешно'
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: вече е създаден
    SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(p_email));
    RETURN json_build_object(
      'success', true,
      'user_id', v_user_id,
      'email',   p_email,
      'message', 'Потребителят вече съществува'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
