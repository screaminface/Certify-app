-- ===============================================
-- PUBLIC SCHEMA WRAPPERS for admin RPC functions
-- ===============================================
-- PostgREST looks in public schema by default
-- These are simple wrappers that call the real app.* functions

-- 1) Wrapper for manual_set_paid_until
CREATE OR REPLACE FUNCTION public.manual_set_paid_until(
  p_tenant_id uuid,
  p_plan_code text,
  p_days int,
  p_note text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  RETURN app.manual_set_paid_until(p_tenant_id, p_plan_code, p_days, p_note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_set_paid_until(uuid, text, int, text) TO authenticated, anon;


-- 2) Wrapper for manual_mark_unpaid
CREATE OR REPLACE FUNCTION public.manual_mark_unpaid(
  p_tenant_id uuid,
  p_new_status text,
  p_note text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  RETURN app.manual_mark_unpaid(p_tenant_id, p_new_status, p_note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_mark_unpaid(uuid, text, text) TO authenticated, anon;


-- 3) Wrapper for refresh_entitlement_for_tenant
CREATE OR REPLACE FUNCTION public.refresh_entitlement_for_tenant(
  p_tenant_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_result json;
BEGIN
  -- Update subscription plan
  UPDATE app.subscriptions
  SET plan_code = p_new_plan,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND provider = 'manual';

  -- Refresh entitlement
  PERFORM app.refresh_entitlement_for_tenant(p_tenant_id);

  -- Return success
  v_result := json_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'new_plan', p_new_plan
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_switch_plan(uuid, text) TO authenticated, anon;


-- Test the wrappers
SELECT public.admin_get_all_tenants();
