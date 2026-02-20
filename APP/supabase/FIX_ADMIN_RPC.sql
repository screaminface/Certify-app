-- ===============================================
-- FIX ADMIN RPC - Run this to fix the dashboard
-- ===============================================

-- STEP 1: Drop old function completely
DROP FUNCTION IF EXISTS app.admin_get_all_tenants() CASCADE;

-- STEP 2: Recreate with proper SECURITY DEFINER
CREATE OR REPLACE FUNCTION app.admin_get_all_tenants()
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  plan_code text,
  subscription_status text,
  current_period_end timestamptz,
  entitlement_status text,
  grace_until timestamptz,
  read_only boolean,
  last_synced_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_catalog
STABLE
AS $$
  SELECT
    t.id,
    t.code,
    t.name,
    COALESCE(s.plan_code, 'monthly') as plan_code,
    COALESCE(s.status, 'expired') as subscription_status,
    s.current_period_end,
    COALESCE(e.status, 'expired') as entitlement_status,
    e.grace_until,
    COALESCE(e.read_only, true) as read_only,
    e.last_synced_at
  FROM app.tenants t
  LEFT JOIN app.subscriptions s ON s.tenant_id = t.id AND s.provider = 'manual'
  LEFT JOIN app.entitlements e ON e.tenant_id = t.id
  ORDER BY t.name ASC;
$$;

-- STEP 3: Grant execute to everyone (security is in APP-ADMIN code)
GRANT EXECUTE ON FUNCTION app.admin_get_all_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION app.admin_get_all_tenants() TO anon;

-- STEP 4: Test it works
SELECT * FROM app.admin_get_all_tenants();

-- Expected: Should return all 5 tenants (autotest, test-quick, spi-demo x3)
