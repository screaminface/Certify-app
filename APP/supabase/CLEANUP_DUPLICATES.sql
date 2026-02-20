-- ===================================================
-- CLEANUP: Remove duplicate subscriptions + Fix admin function
-- ===================================================

-- STEP 1: Show duplicates (diagnostic)
SELECT 
  tenant_id,
  COUNT(*) as subscription_count,
  array_agg(provider_subscription_id) as sub_ids
FROM app.subscriptions
GROUP BY tenant_id
HAVING COUNT(*) > 1;

-- STEP 2: Delete old duplicate subscriptions, keep only the latest
-- This keeps the most recently updated subscription per tenant
DELETE FROM app.subscriptions s1
WHERE EXISTS (
  SELECT 1 
  FROM app.subscriptions s2
  WHERE s2.tenant_id = s1.tenant_id
    AND s2.provider = s1.provider
    AND s2.updated_at > s1.updated_at
);

-- STEP 3: Refresh entitlements for all tenants
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM app.tenants LOOP
    PERFORM app.refresh_entitlement_for_tenant(rec.id);
  END LOOP;
END $$;

-- STEP 4: Fix admin function to show only LATEST subscription per tenant
DROP FUNCTION IF EXISTS public.admin_get_all_tenants() CASCADE;

CREATE OR REPLACE FUNCTION public.admin_get_all_tenants()
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
SET search_path = app, public, pg_catalog
STABLE
AS $$
  WITH latest_subs AS (
    SELECT DISTINCT ON (tenant_id)
      tenant_id,
      plan_code,
      status,
      current_period_end
    FROM app.subscriptions
    WHERE provider = 'manual'
    ORDER BY tenant_id, updated_at DESC, created_at DESC
  )
  SELECT
    t.id,
    t.code,
    t.name,
    COALESCE(s.plan_code, 'monthly'),
    COALESCE(s.status, 'expired'),
    s.current_period_end,
    COALESCE(e.status, 'expired'),
    e.grace_until,
    COALESCE(e.read_only, true),
    e.last_synced_at
  FROM app.tenants t
  LEFT JOIN latest_subs s ON s.tenant_id = t.id
  LEFT JOIN app.entitlements e ON e.tenant_id = t.id
  ORDER BY t.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_tenants() TO authenticated, anon;

-- STEP 5: Verify cleanup worked
SELECT * FROM public.admin_get_all_tenants();

-- Should now show each tenant only once
