-- SPI CERTIFY - seed first tenant + owner membership
-- 1) First create user in Supabase Auth (Dashboard -> Authentication -> Users).
-- 2) Replace OWNER_EMAIL below with the real auth user's email.
-- 3) Run this script.

do $$
declare
  v_owner_email text := 'ventsi.vutov@gmail.com';
  v_owner_user_id uuid := null;
  v_owner_user_id_override uuid := '8fe4b02d-6932-404e-a023-24835c1f5391';
  v_tenant_id uuid;
begin
  -- Preferred: set v_owner_user_id_override if you already have the Auth user UUID.
  if v_owner_user_id_override is not null then
    select u.id into v_owner_user_id
    from auth.users u
    where u.id = v_owner_user_id_override
    limit 1;
  else
    select u.id into v_owner_user_id
    from auth.users u
    where trim(lower(coalesce(u.email, ''))) = trim(lower(v_owner_email))
    limit 1;
  end if;

  if v_owner_user_id is null then
    raise exception 'Auth user not found. Check email/project or use v_owner_user_id_override. Email tried: %', v_owner_email;
  end if;

  -- Optional: adjust code/name
  insert into app.tenants (code, name)
  values ('spi-demo', 'SPI Demo')
  on conflict (code)
  do update set name = excluded.name, updated_at = now()
  returning id into v_tenant_id;

  insert into app.memberships (tenant_id, user_id, username, role, is_active)
  values (v_tenant_id, v_owner_user_id, 'owner', 'owner', true)
  on conflict (tenant_id, user_id)
  do update set
    role = 'owner',
    is_active = true,
    updated_at = now();

  -- Create initial manual subscription + entitlement (for testing)
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
    'manual-seed-spi-demo',
    'monthly',
    'active',
    now(),
    now() + interval '30 day'
  )
  on conflict (provider, provider_subscription_id)
  do update set
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    updated_at = now();

  perform app.refresh_entitlement_for_tenant(v_tenant_id);
end $$;
