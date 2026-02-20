-- ===============================================
-- Admin function: Create tenant with owner user
-- ===============================================

CREATE OR REPLACE FUNCTION public.admin_create_tenant_with_user(
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

  -- 2) Verify user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- 3) Create tenant
  INSERT INTO app.tenants (code, name, is_active)
  VALUES (p_tenant_code, p_tenant_name, true)
  RETURNING id INTO v_tenant_id;

  -- 4) Create profile for owner
  INSERT INTO app.profiles (user_id, email, display_name, locale)
  VALUES (p_user_id, p_owner_email, p_tenant_name, 'bg');

  -- 5) Create membership (owner role)
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

  -- 7) Create entitlement
  v_entitlement := app.refresh_entitlement_for_tenant(v_tenant_id);

  -- 8) Return success
  RETURN json_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_code', p_tenant_code,
    'owner_email', p_owner_email,
    'subscription_id', v_subscription_id,
    'plan', p_plan_code,
    'days', p_days,
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

GRANT EXECUTE ON FUNCTION public.admin_create_tenant_with_user(uuid, text, text, text, text, int) TO authenticated, anon;

-- Usage: First create user with Admin API, then create tenant structure
-- Example from React:
-- const { data: user } = await adminClient.auth.admin.createUser({ email, password })
-- await supabase.rpc('admin_create_tenant_with_user', {
--   p_user_id: user.user.id,
--   p_tenant_name: 'My Company',
--   p_tenant_code: 'my-company',
--   p_owner_email: 'owner@company.com',
--   p_plan_code: 'monthly',
--   p_days: 30
-- })

