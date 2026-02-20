-- ===============================================
-- ADMIN DASHBOARD SETUP - Run this in Supabase SQL Editor
-- ===============================================

-- STEP 1: Create admin RPC function (bypasses RLS)
-- ================================================
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
language sql
security definer
set search_path = app, pg_catalog
stable
as $$
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
$$;

grant execute on function app.admin_get_all_tenants() to authenticated, anon;


-- STEP 2: Create test tenant + subscription
-- ==========================================
do $$
declare
  v_owner_email text := 'ventsi.vutov@gmail.com';
  v_owner_user_id uuid;
  v_tenant_id uuid;
begin
  -- Find user
  select id into v_owner_user_id
  from auth.users
  where email = v_owner_email
  limit 1;

  if v_owner_user_id is null then
    raise exception 'User not found: %', v_owner_email;
  end if;

  raise notice '✓ Found user: % (id: %)', v_owner_email, v_owner_user_id;

  -- Create tenant
  insert into app.tenants (code, name)
  values ('spi-demo', 'SPI Demo Company')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id into v_tenant_id;

  raise notice '✓ Created tenant: spi-demo (id: %)', v_tenant_id;

  -- Create membership (IMPORTANT for main app access)
  insert into app.memberships (tenant_id, user_id, role, is_active)
  values (v_tenant_id, v_owner_user_id, 'owner', true)
  on conflict (tenant_id, user_id) 
  do update set role = 'owner', is_active = true, updated_at = now();

  raise notice '✓ Created membership';

  -- Create subscription (30 days active)
  insert into app.subscriptions (
    tenant_id, provider, provider_subscription_id,
    plan_code, status, current_period_start, current_period_end
  )
  values (
    v_tenant_id, 'manual', 'seed-' || v_tenant_id::text,
    'monthly', 'active', now(), now() + interval '30 day'
  )
  on conflict (provider, provider_subscription_id) 
  do update set 
    status = 'active',
    current_period_end = now() + interval '30 day',
    updated_at = now();

  raise notice '✓ Created subscription (expires: %)', now() + interval '30 day';

  -- Refresh entitlement
  perform app.refresh_entitlement_for_tenant(v_tenant_id);

  raise notice '✓ Refreshed entitlement';
  raise notice '========================================';
  raise notice '✅ SUCCESS! Tenant created and active';
  raise notice '========================================';
end $$;


-- STEP 3: Verify everything works
-- ================================
-- Test admin RPC function
select * from app.admin_get_all_tenants();

-- Show tenant details
select 
  t.code,
  t.name,
  s.plan_code,
  s.status,
  s.current_period_end,
  e.status as entitlement_status,
  e.read_only,
  e.grace_until
from app.tenants t
left join app.subscriptions s on s.tenant_id = t.id
left join app.entitlements e on e.tenant_id = t.id
where t.code = 'spi-demo';
