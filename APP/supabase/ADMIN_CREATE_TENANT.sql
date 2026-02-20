-- ===============================================
-- Admin: Create new company tenant (no auth user)
-- ===============================================

CREATE OR REPLACE FUNCTION public.admin_create_tenant(
  p_tenant_name text,
  p_tenant_code text,
  p_contact_email text,
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

  -- 2) Create tenant (company)
  INSERT INTO app.tenants (code, name, is_active)
  VALUES (p_tenant_code, p_tenant_name, true)
  RETURNING id INTO v_tenant_id;

  -- 3) Create subscription
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

  -- 4) Create entitlement
  v_entitlement := app.refresh_entitlement_for_tenant(v_tenant_id);

  -- 5) Return success
  RETURN json_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_code', p_tenant_code,
    'contact_email', p_contact_email,
    'subscription_id', v_subscription_id,
    'plan', p_plan_code,
    'days', p_days,
    'entitlement_status', v_entitlement.entitlement_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text, text, int) TO authenticated, anon;

-- Usage: Add new company tenant
-- SELECT public.admin_create_tenant(
--   'Alpha Security Company',
--   'alpha',
--   'contact@alpha.com',
--   'monthly',
--   30
-- );

