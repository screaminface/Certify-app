-- ===============================================
-- FIX: Create admin function in PUBLIC schema
-- ===============================================
-- Supabase PostgREST searches in public schema by default

-- Drop old version if exists
DROP FUNCTION IF EXISTS public.admin_get_all_tenants() CASCADE;

-- Create in PUBLIC schema (not app schema)
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
  LEFT JOIN app.subscriptions s ON s.tenant_id = t.id AND s.provider = 'manual'
  LEFT JOIN app.entitlements e ON e.tenant_id = t.id
  ORDER BY t.name ASC;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.admin_get_all_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_tenants() TO anon;

-- Test it
SELECT * FROM public.admin_get_all_tenants();
