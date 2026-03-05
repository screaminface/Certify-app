-- ================================================================
-- FIX: admin_create_tenant — изтрий ДВАТА overload-а и остави само един
-- ================================================================
-- Проблем: съществуват два варианта на функцията:
--   1) admin_create_tenant(name, code, email, plan, days)
--   2) admin_create_tenant(name, code, email, plan, days, password)
-- PostgreSQL не може да избере при named parameters → ambiguous function call
-- Решение: DROP двата, CREATE само без p_password
--   (паролата се обработва от admin_create_user(), извикван преди това от UI-а)
-- ================================================================

DROP FUNCTION IF EXISTS public.admin_create_tenant(text, text, text, text, int);
DROP FUNCTION IF EXISTS public.admin_create_tenant(text, text, text, text, int, text);
DROP FUNCTION IF EXISTS public.admin_create_tenant(text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.admin_create_tenant(text, text, text, text, integer, text);

CREATE FUNCTION public.admin_create_tenant(
  p_tenant_name   text,
  p_tenant_code   text,
  p_contact_email text,
  p_plan_code     text DEFAULT 'monthly',
  p_days          integer DEFAULT 30
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, auth, public, pg_catalog
AS $$
DECLARE
  v_tenant_id       uuid;
  v_subscription_id uuid;
  v_entitlement     app.entitlements;
  v_owner_user_id   uuid;
  v_user_linked     boolean := false;
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  IF p_plan_code NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Invalid plan_code: %. Use monthly or yearly.', p_plan_code;
  END IF;

  IF EXISTS (SELECT 1 FROM app.tenants WHERE code = p_tenant_code) THEN
    RAISE EXCEPTION 'Tenant code "%" вече съществува', p_tenant_code;
  END IF;

  -- Търси потребител по имейл (вече е създаден от admin_create_user ако е нов)
  SELECT id INTO v_owner_user_id
  FROM auth.users
  WHERE email = lower(trim(p_contact_email))
  LIMIT 1;

  -- Създай tenant
  INSERT INTO app.tenants (code, name, is_active)
  VALUES (p_tenant_code, p_tenant_name, true)
  RETURNING id INTO v_tenant_id;

  -- Свържи потребителя като owner
  IF v_owner_user_id IS NOT NULL THEN
    INSERT INTO app.memberships (tenant_id, user_id, role, is_active)
    VALUES (v_tenant_id, v_owner_user_id, 'owner', true)
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = 'owner', is_active = true, updated_at = now();
    v_user_linked := true;
  END IF;

  -- Създай абонамент
  INSERT INTO app.subscriptions (
    tenant_id, provider, provider_subscription_id,
    plan_code, status, current_period_start, current_period_end
  )
  VALUES (
    v_tenant_id, 'manual', 'manual-' || v_tenant_id::text,
    p_plan_code, 'active', now(), now() + make_interval(days => p_days)
  )
  RETURNING id INTO v_subscription_id;

  -- Обнови entitlement
  v_entitlement := app.refresh_entitlement_for_tenant(v_tenant_id);

  RETURN json_build_object(
    'success',            true,
    'tenant_id',          v_tenant_id,
    'tenant_code',        p_tenant_code,
    'user_linked',        v_user_linked,
    'subscription_id',    v_subscription_id,
    'plan',               p_plan_code,
    'days',               p_days,
    'entitlement_status', v_entitlement.status
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text, text, integer) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
