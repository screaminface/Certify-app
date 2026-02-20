-- ===============================================
-- Admin function: Create new tenant for existing user
-- ===============================================

CREATE OR REPLACE FUNCTION public.admin_create_tenant(
  p_user_id uuid,
  p_tenant_name text,
  p_tenant_code text,
  p_owner_email text,
  p_plan_code text DEFAULT 'monthly',
  p_days int DEFAULT 30
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_tenant_id uuid;
  v_subscription_id uuid;
  v_entitlement app.entitlements;
BEGIN
  -- 1) Check if tenant code already exists
  IF EXISTS (SELECT 1 FROM app.tenants WHERE code = p_tenant_code) THEN
    RAISE EXCEPTION 'Tenant code "%" already exists', p_tenant_code;
  END IF;

  -- 2) Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User ID not found';
  END IF;

  -- 3) Create tenant
  INSERT INTO app.tenants (code, name, is_active)
  VALUES (p_tenant_code, p_tenant_name, true)
  RETURNING id INTO v_tenant_id;

  -- 4) Create profile
  INSERT INTO app.profiles (user_id, email, display_name, locale)
  VALUES (p_user_id, p_owner_email, p_tenant_name, 'bg');

  -- 5) Create membership (owner)
  INSERT INTO app.memberships (tenant_id, user_id, role, is_active)
  VALUES (v_tenant_id, p_user_id, 'owner', true);

  -- 6) Create subscription (manual)
  INSERT INTO app.subscriptions (
    tenant_id,
    provider,
    plan_code,
    status,
    current_period_start,
    current_period_end
  )
  VALUES (
    v_tenant_id,
    'manual',
    p_plan_code,
    'active',
    now(),
    now() + make_interval(days => p_days)
  )
  RETURNING id INTO v_subscription_id;

  -- 8) Create entitlement
  v_entitlement := app.refresh_entitlement_for_tenant(v_tenant_id);

  -- 9) Return success
  RETURN json_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_code', p_tenant_code,
    'owner_email', p_owner_email,
    'entitlement', row_to_json(v_entitlement)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_tenant(uuid, text, text, text, text, int) TO authenticated, anon;

-- Usage example:
-- First create user with auth.signUp(), then call:
-- SELECT public.admin_create_tenant(
--   'user-uuid-here'::uuid,
--   'Test Company',
--   'test-company',
--   'owner@test.com',
--   'monthly',
--   30
-- );
