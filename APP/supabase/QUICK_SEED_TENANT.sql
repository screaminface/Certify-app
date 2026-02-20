-- QUICK SEED: Create demo tenant for testing admin dashboard
-- Run this in Supabase SQL Editor

do $$
declare
  v_owner_email text := 'ventsi.vutov@gmail.com';
  v_owner_user_id uuid;
  v_tenant_id uuid;
begin
  -- Find user ID by email
  select id into v_owner_user_id
  from auth.users
  where email = v_owner_email
  limit 1;

  if v_owner_user_id is null then
    raise exception 'User not found: %', v_owner_email;
  end if;

  raise notice 'Found user: % (id: %)', v_owner_email, v_owner_user_id;

  -- Create tenant
  insert into app.tenants (code, name)
  values ('spi-demo', 'SPI Demo Company')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id into v_tenant_id;

  raise notice 'Created tenant: % (id: %)', 'spi-demo', v_tenant_id;

  -- Create membership
  insert into app.memberships (tenant_id, user_id, role, is_active)
  values (v_tenant_id, v_owner_user_id, 'owner', true)
  on conflict (tenant_id, user_id) 
  do update set role = 'owner', is_active = true, updated_at = now();

  raise notice 'Created membership for user';

  -- Create subscription (30 days active)
  insert into app.subscriptions (
    tenant_id,
    provider,
    provider_subscription_id,
    plan_code,
    status,
    current_period_start,
    current_period_end
  )
  values (
    v_tenant_id,
    'manual',
    'seed-demo-' || v_tenant_id::text,
    'monthly',
    'active',
    now(),
    now() + interval '30 day'
  )
  on conflict (provider, provider_subscription_id) 
  do update set 
    status = 'active',
    current_period_end = now() + interval '30 day',
    updated_at = now();

  raise notice 'Created subscription (30 days)';

  -- Refresh entitlement
  perform app.refresh_entitlement_for_tenant(v_tenant_id);

  raise notice '✅ DONE! Tenant ready with active subscription';
end $$;

-- Verify results
select 
  t.code,
  t.name,
  s.plan_code,
  s.status,
  s.current_period_end,
  e.status as entitlement_status,
  e.read_only
from app.tenants t
left join app.subscriptions s on s.tenant_id = t.id
left join app.entitlements e on e.tenant_id = t.id
where t.code = 'spi-demo';
