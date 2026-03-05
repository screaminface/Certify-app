-- SPI CERTIFY - Admin functions
-- Run after all migrations
-- These functions are for admin dashboard use only

create schema if not exists app;

-- Admin function: get all tenants with subscriptions and entitlements
-- SECURITY DEFINER bypasses RLS policies
-- IMPORTANT: This function has FULL database access, admin check is in client
create or replace function app.admin_get_all_tenants()
returns table (
  id uuid,
  code text,
  name text,
  owner_email text,
  plan_code text,
  subscription_status text,
  current_period_end timestamptz,
  entitlement_status text,
  grace_until timestamptz,
  read_only boolean,
  last_synced_at timestamptz
)
language sql
security definer
set search_path = app, auth, pg_catalog
stable
as $$
  select
    t.id,
    t.code,
    t.name,
    (
      select u.email
      from app.memberships m
      join auth.users u on u.id = m.user_id
      where m.tenant_id = t.id
        and m.role = 'owner'
        and m.is_active = true
      limit 1
    ) as owner_email,
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
$$;

-- Grant execute to authenticated users (admin check happens in APP-ADMIN login)
-- For production: add proper admin role table
grant execute on function app.admin_get_all_tenants() to authenticated, anon;
