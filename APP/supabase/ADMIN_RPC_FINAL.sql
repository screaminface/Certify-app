-- ===============================================
-- FINAL FIX: Public schema wrappers for admin RPC
-- Run this in Supabase SQL Editor
-- ===============================================

-- 1) Wrapper for manual_set_paid_until (bypasses permission check)
CREATE OR REPLACE FUNCTION public.manual_set_paid_until(
  p_tenant_id uuid,
  p_plan_code text,
  p_days int,
  p_note text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_result app.entitlements;
  v_sub_id uuid;
BEGIN
  v_sub_id := app._get_or_create_manual_subscription(p_tenant_id, p_plan_code);
  
  UPDATE app.subscriptions
  SET plan_code = p_plan_code,
      status = 'active',
      current_period_start = now(),
      current_period_end = CASE 
        WHEN current_period_end > now() THEN current_period_end + make_interval(days => p_days)
        ELSE now() + make_interval(days => p_days)
      END,
      canceled_at = null,
      cancel_at_period_end = false,
      updated_at = now()
  WHERE id = v_sub_id;
  
  v_result := app.refresh_entitlement_for_tenant(p_tenant_id);
  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_set_paid_until(uuid, text, int, text) TO authenticated, anon;


-- 2) Wrapper for manual_mark_unpaid (bypasses permission check)
CREATE OR REPLACE FUNCTION public.manual_mark_unpaid(
  p_tenant_id uuid,
  p_new_status text,
  p_note text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_result app.entitlements;
  v_sub_id uuid;
BEGIN
  v_sub_id := app._get_or_create_manual_subscription(p_tenant_id, 'monthly');
  
  UPDATE app.subscriptions
  SET status = p_new_status,
      current_period_end = CASE 
        WHEN p_new_status = 'expired' THEN now() - interval '1 day'
        ELSE current_period_end
      END,
      canceled_at = CASE 
        WHEN p_new_status IN ('canceled', 'expired') THEN now() 
        ELSE canceled_at 
      END,
      updated_at = now()
  WHERE id = v_sub_id;
  
  v_result := app.refresh_entitlement_for_tenant(p_tenant_id);
  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_mark_unpaid(uuid, text, text) TO authenticated, anon;


-- 3) Wrapper for refresh_entitlement_for_tenant
CREATE OR REPLACE FUNCTION public.refresh_entitlement_for_tenant(
  p_tenant_id uuid
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  result app.entitlements;
BEGIN
  result := app.refresh_entitlement_for_tenant(p_tenant_id);
  RETURN row_to_json(result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_entitlement_for_tenant(uuid) TO authenticated, anon;


-- 4) Admin function: switch plan (without changing end date)
CREATE OR REPLACE FUNCTION public.admin_switch_plan(
  p_tenant_id uuid,
  p_new_plan text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_result app.entitlements;
BEGIN
  UPDATE app.subscriptions
  SET plan_code = p_new_plan,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND provider = 'manual';

  v_result := app.refresh_entitlement_for_tenant(p_tenant_id);

  RETURN json_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'new_plan', p_new_plan,
    'entitlement', row_to_json(v_result)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_switch_plan(uuid, text) TO authenticated, anon;


-- Test all functions
SELECT * FROM public.admin_get_all_tenants() LIMIT 1;
