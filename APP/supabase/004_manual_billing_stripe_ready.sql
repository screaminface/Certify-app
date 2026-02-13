-- SPI CERTIFY - Manual billing ops (Stripe-ready structure)
-- Run after 001, 002, 003

create schema if not exists app;

-- Optional: keep a simple billing event log (works now for manual, later for Stripe webhooks too)
create table if not exists app.billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  provider text not null check (provider in ('manual', 'stripe', 'paddle')),
  event_type text not null,
  external_event_id text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint billing_events_external_unique unique (provider, external_event_id)
);

create index if not exists billing_events_tenant_idx on app.billing_events(tenant_id);
create index if not exists billing_events_created_at_idx on app.billing_events(created_at desc);

alter table app.billing_events enable row level security;

drop policy if exists billing_events_select_member on app.billing_events;
create policy billing_events_select_member
on app.billing_events
for select
to authenticated
using (app.is_tenant_member(tenant_id));

drop policy if exists billing_events_admin_write on app.billing_events;
create policy billing_events_admin_write
on app.billing_events
for all
to authenticated
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

-- Internal helper: get active manual subscription row for tenant
create or replace function app._get_or_create_manual_subscription(p_tenant_id uuid, p_plan_code text)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_sub_id uuid;
  v_provider_subscription_id text;
begin
  v_provider_subscription_id := 'manual-' || p_tenant_id::text;

  insert into app.subscriptions (
    tenant_id,
    provider,
    provider_subscription_id,
    plan_code,
    status,
    current_period_start,
    current_period_end,
    metadata
  )
  values (
    p_tenant_id,
    'manual',
    v_provider_subscription_id,
    p_plan_code,
    'active',
    now(),
    now(),
    jsonb_build_object('mode', 'manual')
  )
  on conflict (provider, provider_subscription_id)
  do update set
    plan_code = excluded.plan_code,
    updated_at = now()
  returning id into v_sub_id;

  return v_sub_id;
end;
$$;

-- Manual activation/renewal (admin action)
-- p_period_days: for monthly use 30, yearly use 365
create or replace function app.manual_set_paid_until(
  p_tenant_id uuid,
  p_plan_code text,
  p_period_days int,
  p_note text default null
)
returns app.entitlements
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_sub_id uuid;
  v_current_end timestamptz;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_result app.entitlements;
begin
  if p_plan_code not in ('monthly', 'yearly') then
    raise exception 'Invalid plan_code: %', p_plan_code;
  end if;

  if p_period_days <= 0 then
    raise exception 'p_period_days must be > 0';
  end if;

  if current_user <> 'postgres' and not app.is_tenant_admin(p_tenant_id) then
    raise exception 'Only tenant admin/owner can update billing';
  end if;

  v_sub_id := app._get_or_create_manual_subscription(p_tenant_id, p_plan_code);

  select current_period_end into v_current_end
  from app.subscriptions
  where id = v_sub_id;

  -- If current end is in future, extend from it. Otherwise start now.
  v_new_start := case
    when v_current_end is not null and v_current_end > now() then v_current_end
    else now()
  end;
  v_new_end := v_new_start + make_interval(days => p_period_days);

  update app.subscriptions
  set
    plan_code = p_plan_code,
    status = 'active',
    current_period_start = now(),
    current_period_end = v_new_end,
    canceled_at = null,
    cancel_at_period_end = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'mode', 'manual',
      'last_manual_note', p_note,
      'last_manual_by', auth.uid(),
      'last_manual_at', now()
    ),
    updated_at = now()
  where id = v_sub_id;

  insert into app.billing_events (
    tenant_id,
    provider,
    event_type,
    external_event_id,
    payload,
    created_by
  )
  values (
    p_tenant_id,
    'manual',
    'manual.payment_recorded',
    null,
    jsonb_build_object(
      'plan_code', p_plan_code,
      'period_days', p_period_days,
      'new_period_end', v_new_end,
      'note', p_note
    ),
    auth.uid()
  );

  v_result := app.refresh_entitlement_for_tenant(p_tenant_id);
  return v_result;
end;
$$;

-- Manual mark as unpaid/canceled (admin action)
create or replace function app.manual_mark_unpaid(
  p_tenant_id uuid,
  p_status text default 'past_due',
  p_note text default null
)
returns app.entitlements
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_sub_id uuid;
  v_result app.entitlements;
begin
  if p_status not in ('past_due', 'unpaid', 'canceled', 'expired') then
    raise exception 'Invalid unpaid status: %', p_status;
  end if;

  if current_user <> 'postgres' and not app.is_tenant_admin(p_tenant_id) then
    raise exception 'Only tenant admin/owner can update billing';
  end if;

  v_sub_id := app._get_or_create_manual_subscription(p_tenant_id, 'monthly');

  update app.subscriptions
  set
    status = p_status,
    canceled_at = case when p_status in ('canceled', 'expired') then now() else canceled_at end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'mode', 'manual',
      'last_manual_note', p_note,
      'last_manual_by', auth.uid(),
      'last_manual_at', now()
    ),
    updated_at = now()
  where id = v_sub_id;

  insert into app.billing_events (
    tenant_id,
    provider,
    event_type,
    external_event_id,
    payload,
    created_by
  )
  values (
    p_tenant_id,
    'manual',
    'manual.subscription_status_changed',
    null,
    jsonb_build_object(
      'status', p_status,
      'note', p_note
    ),
    auth.uid()
  );

  v_result := app.refresh_entitlement_for_tenant(p_tenant_id);
  return v_result;
end;
$$;

-- Optional helper for Stripe migration later: unified event ingest signature
-- for now it stores event and can call refresh_entitlement_for_tenant if needed.
create or replace function app.billing_ingest_event(
  p_tenant_id uuid,
  p_provider text,
  p_event_type text,
  p_external_event_id text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if p_provider not in ('manual', 'stripe', 'paddle') then
    raise exception 'Invalid provider: %', p_provider;
  end if;

  insert into app.billing_events (
    tenant_id,
    provider,
    event_type,
    external_event_id,
    payload,
    created_by
  )
  values (
    p_tenant_id,
    p_provider,
    p_event_type,
    p_external_event_id,
    coalesce(p_payload, '{}'::jsonb),
    auth.uid()
  )
  on conflict (provider, external_event_id)
  do nothing;
end;
$$;

-- Grants for authenticated app admins
grant execute on function app.manual_set_paid_until(uuid, text, int, text) to authenticated;
grant execute on function app.manual_mark_unpaid(uuid, text, text) to authenticated;

-- Keep internal helpers private
revoke all on function app._get_or_create_manual_subscription(uuid, text) from public;
revoke all on function app.billing_ingest_event(uuid, text, text, text, jsonb) from public;
