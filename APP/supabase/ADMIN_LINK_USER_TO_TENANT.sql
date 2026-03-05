-- ================================================================
-- SPI CERTIFY — admin_link_user_to_tenant
-- ================================================================
-- Пусни в Supabase SQL Editor (след ADMIN_RPC_V2_CLEAN.sql)
--
-- Използва се когато:
--   - Tenant съществува, но потребителят НЕ е имал акаунт при създаването
--   - Клиент не може да влезе ("No active tenant membership")
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_link_user_to_tenant(
  p_tenant_id uuid,
  p_email     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, auth, public, pg_catalog
AS $$
DECLARE
  v_user_id  uuid;
  v_existing boolean;
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  -- Провери дали tenant съществува
  IF NOT EXISTS (SELECT 1 FROM app.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
  END IF;

  -- Намери потребителя по имейл
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = lower(trim(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Потребител с имейл "%s" не е намерен в auth.users. Трябва първо да се регистрира или да бъде създаден.', p_email)
    );
  END IF;

  -- Свържи (upsert)
  INSERT INTO app.memberships (tenant_id, user_id, role, is_active)
  VALUES (p_tenant_id, v_user_id, 'owner', true)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = 'owner', is_active = true, updated_at = now();

  RETURN json_build_object(
    'success',  true,
    'user_id',  v_user_id,
    'email',    p_email,
    'message',  format('Потребителят "%s" е свързан като owner на tenant-а.', p_email)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_link_user_to_tenant(uuid, text) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ================================================================
-- ПРОВЕРКА: Кои tenants нямат свързан потребител?
-- ================================================================
-- SELECT
--   t.id,
--   t.code,
--   t.name,
--   m.user_id,
--   u.email
-- FROM app.tenants t
-- LEFT JOIN app.memberships m ON m.tenant_id = t.id AND m.role = 'owner' AND m.is_active = true
-- LEFT JOIN auth.users u ON u.id = m.user_id
-- ORDER BY t.name;
