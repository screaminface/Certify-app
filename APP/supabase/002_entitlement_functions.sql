-- SPI CERTIFY - Entitlement functions (10 calendar days grace)
-- Run after 001_multi_tenant_auth.sql

create schema if not exists app;

-- Recompute entitlement for a tenant from latest subscription
create or replace function app.refresh_entitlement_for_tenant(p_tenant_id uuid)
returns app.entitlements
language plpgsql
security definer
set search_path = app, public
as $$
declare
  latest_sub app.subscriptions;
  target_status text;
  target_read_only boolean;
  target_plan text;
  target_period_end timestamptz;
  target_grace_until timestamptz;
  result_row app.entitlements;
begin
  select s.*
    into latest_sub
  from app.subscriptions s
  where s.tenant_id = p_tenant_id
  order by s.updated_at desc, s.created_at desc
  limit 1;

  if latest_sub.id is null then
    target_plan := 'monthly';
    target_status := 'expired';
    target_read_only := true;
    target_period_end := null;
    target_grace_until := null;
  else
    target_plan := latest_sub.plan_code;
    target_period_end := latest_sub.current_period_end;
    target_grace_until := case
      when latest_sub.current_period_end is not null then latest_sub.current_period_end + interval '10 day'
      else null
    end;

    if latest_sub.status in ('active', 'trialing') then
      target_status := 'active';
      target_read_only := false;
    elsif latest_sub.status in ('past_due', 'unpaid', 'paused', 'incomplete', 'canceled', 'expired') then
      if target_grace_until is not null and now() <= target_grace_until then
        target_status := 'grace';
        target_read_only := false;
      else
        target_status := 'expired';
        target_read_only := true;
      end if;
    else
      target_status := 'expired';
      target_read_only := true;
    end if;
  end if;

  insert into app.entitlements (
    tenant_id,
    plan_code,
    status,
    current_period_end,
    grace_until,
    read_only,
    source_subscription_id,
    last_synced_at
  )
  values (
    p_tenant_id,
    target_plan,
    target_status,
    target_period_end,
    target_grace_until,
    target_read_only,
    latest_sub.id,
    now()
  )
  on conflict (tenant_id)
  do update set
    plan_code = excluded.plan_code,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    grace_until = excluded.grace_until,
    read_only = excluded.read_only,
    source_subscription_id = excluded.source_subscription_id,
    last_synced_at = excluded.last_synced_at,
    updated_at = now()
  returning * into result_row;

  return result_row;
end;
$$;

-- Read entitlement for current user (member of tenant)
create or replace function app.entitlement_me(p_tenant_id uuid default null)
returns table (
  tenant_id uuid,
  plan_code text,
  status text,
  current_period_end timestamptz,
  grace_until timestamptz,
  read_only boolean,
  days_until_read_only integer
)
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  selected_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_tenant_id is not null then
    if not app.is_tenant_member(p_tenant_id) then
      raise exception 'Not a member of this tenant';
    end if;
    selected_tenant := p_tenant_id;
  else
    select m.tenant_id
      into selected_tenant
    from app.memberships m
    where m.user_id = auth.uid()
      and m.is_active = true
    order by
      case m.role
        when 'owner' then 1
        when 'admin' then 2
        when 'manager' then 3
        else 4
      end,
      m.created_at asc
    limit 1;

    if selected_tenant is null then
      raise exception 'No active tenant membership';
    end if;
  end if;

  perform app.refresh_entitlement_for_tenant(selected_tenant);

  return query
  select
    e.tenant_id,
    e.plan_code,
    e.status,
    e.current_period_end,
    e.grace_until,
    e.read_only,
    case
      when e.read_only = true then 0
      when e.grace_until is null then null
      else greatest(0, ceil(extract(epoch from (e.grace_until - now())) / 86400.0)::int)
    end as days_until_read_only
  from app.entitlements e
  where e.tenant_id = selected_tenant;
end;
$$;

-- Optional: register/touch current device (for future device limits)
create or replace function app.register_or_touch_device(
  p_tenant_id uuid,
  p_device_fingerprint text,
  p_device_name text default null,
  p_app_version text default null
)
returns app.devices
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  row_out app.devices;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Not a member of this tenant';
  end if;

  insert into app.devices (
    tenant_id,
    user_id,
    device_fingerprint,
    device_name,
    app_version,
    last_seen_at
  )
  values (
    p_tenant_id,
    auth.uid(),
    p_device_fingerprint,
    p_device_name,
    p_app_version,
    now()
  )
  on conflict (tenant_id, device_fingerprint)
  do update set
    user_id = excluded.user_id,
    device_name = excluded.device_name,
    app_version = excluded.app_version,
    last_seen_at = now(),
    revoked_at = null,
    updated_at = now()
  returning * into row_out;

  return row_out;
end;
$$;

-- Permissions for authenticated clients
revoke all on function app.refresh_entitlement_for_tenant(uuid) from public;
grant execute on function app.entitlement_me(uuid) to authenticated;
grant execute on function app.register_or_touch_device(uuid, text, text, text) to authenticated;

-- refresh_entitlement_for_tenant should be called by webhook/service role only.
