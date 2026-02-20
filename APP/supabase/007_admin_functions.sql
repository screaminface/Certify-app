-- SPI CERTIFY - Admin functions
-- Run after all migrations
-- These functions are for admin dashboard use only

create schema if not exists app;

-- Admin function: get all tenants with subscriptions and entitlements
-- SECURITY: Only restrict access via client-side email check
-- For production: add proper RLS or require specific admin role
create or replace function app.admin_get_all_tenants()
returns table (
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
language plpgsql
security definer
set search_path = app, public
as $$
begin
  return query
  select
    t.id,
    t.code,
    t.name,
    coalesce(s.plan_code, 'monthly') as plan_code,
    coalesce(s.status, 'expired') as subscription_status,
    s.current_period_end,
    coalesce(e.status, 'expired') as entitlement_status,
    e.grace_until,
    coalesce(e.read_only, true) as read_only,
    e.last_synced_at
  from app.tenants t
  left join app.subscriptions s on s.tenant_id = t.id and s.provider = 'manual'
  left join app.entitlements e on e.tenant_id = t.id
  order by t.name asc;
end;
$$;

-- Grant execute to authenticated users (admin check is in client code)
-- For production: create admin role and grant only to that
grant execute on function app.admin_get_all_tenants() to authenticated, anon;
