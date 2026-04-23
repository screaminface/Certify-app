-- ================================================================
-- SPI CERTIFY — Missing admin RPC functions
-- Run in Supabase SQL Editor
-- These are the functions called by useAdminActions.ts in APP-ADMIN
-- ================================================================

-- ----------------------------------------------------------------
-- 1) admin_extend_subscription
--    Wrapper for manual_set_paid_until.
--    Called by "+30 дни", "+1 година", "Активирай (+30д)" buttons.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_extend_subscription(
  p_tenant_id  uuid,
  p_plan_code  text,
  p_days       int,
  p_note       text DEFAULT 'Admin extended'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_sub_id uuid;
BEGIN
  -- Get or create manual subscription
  v_sub_id := app._get_or_create_manual_subscription(p_tenant_id, p_plan_code);

  -- Extend: if current_period_end is in the future keep it, otherwise start from now
  UPDATE app.subscriptions
  SET plan_code             = p_plan_code,
      status                = 'active',
      current_period_start  = CASE
                                WHEN current_period_end > now() THEN current_period_start
                                ELSE now()
                              END,
      current_period_end    = CASE
                                WHEN current_period_end > now() THEN current_period_end + make_interval(days => p_days)
                                ELSE now() + make_interval(days => p_days)
                              END,
      canceled_at           = NULL,
      cancel_at_period_end  = false,
      updated_at            = now()
  WHERE id = v_sub_id;

  -- Refresh entitlement cache
  PERFORM app.refresh_entitlement_for_tenant(p_tenant_id);

  RETURN json_build_object(
    'success',   true,
    'tenant_id', p_tenant_id,
    'days',      p_days,
    'plan',      p_plan_code
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, text, int, text) TO authenticated, anon;


-- ----------------------------------------------------------------
-- 2) admin_lock_tenant
--    Immediately expire the tenant (no grace period).
--    Called by the "Заключи" (lock) button.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_lock_tenant(
  p_tenant_id uuid,
  p_note      text DEFAULT 'Admin locked'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_sub_id uuid;
BEGIN
  v_sub_id := app._get_or_create_manual_subscription(p_tenant_id, 'monthly');

  UPDATE app.subscriptions
  SET status               = 'expired',
      current_period_end   = now() - interval '11 days', -- push past grace window too
      canceled_at          = now(),
      cancel_at_period_end = false,
      updated_at           = now()
  WHERE id = v_sub_id;

  -- Refresh entitlement cache
  PERFORM app.refresh_entitlement_for_tenant(p_tenant_id);

  RETURN json_build_object(
    'success',   true,
    'tenant_id', p_tenant_id,
    'status',    'expired'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_lock_tenant(uuid, text) TO authenticated, anon;


-- ----------------------------------------------------------------
-- 3) admin_set_grace
--    Grant N days of grace (read-write, but subscription is "past_due").
--    Default = 10 days.
--    Called by the "Гратис" button.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_grace(
  p_tenant_id uuid,
  p_days      int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_sub_id     uuid;
  v_grace_until timestamptz;
BEGIN
  v_sub_id := app._get_or_create_manual_subscription(p_tenant_id, 'monthly');

  -- grace_until = current_period_end + 10 days (hard-coded in refresh function)
  -- So: current_period_end = now() + p_days - 10 days  → grace_until = now() + p_days
  v_grace_until := now() + make_interval(days => p_days);

  UPDATE app.subscriptions
  SET status               = 'past_due',
      current_period_end   = v_grace_until - interval '10 days',
      canceled_at          = NULL,
      cancel_at_period_end = false,
      updated_at           = now()
  WHERE id = v_sub_id;

  -- Refresh entitlement cache
  PERFORM app.refresh_entitlement_for_tenant(p_tenant_id);

  RETURN json_build_object(
    'success',     true,
    'tenant_id',   p_tenant_id,
    'grace_until', v_grace_until
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_grace(uuid, int) TO authenticated, anon;


-- ----------------------------------------------------------------
-- 4) admin_delete_tenant
--    Permanently delete a tenant and all related data (CASCADE).
--    Returns { success, deleted_tenant } or { success: false, error }.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_tenant(
  p_tenant_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_tenant_name text;
BEGIN
  -- Capture name before deleting
  SELECT name INTO v_tenant_name FROM app.tenants WHERE id = p_tenant_id;

  IF v_tenant_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Tenant not found');
  END IF;

  -- Delete in dependency order (FK constraints)
  DELETE FROM app.entitlements  WHERE tenant_id = p_tenant_id;
  DELETE FROM app.subscriptions WHERE tenant_id = p_tenant_id;
  DELETE FROM app.devices       WHERE tenant_id = p_tenant_id;
  DELETE FROM app.memberships   WHERE tenant_id = p_tenant_id;
  DELETE FROM app.tenants       WHERE id        = p_tenant_id;

  RETURN json_build_object(
    'success',        true,
    'deleted_tenant', v_tenant_name
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_tenant(uuid) TO authenticated, anon;


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
