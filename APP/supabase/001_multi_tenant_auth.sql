-- SPI CERTIFY - Supabase multi-tenant schema (JWT + subscriptions + read-only entitlement)
-- Run in Supabase SQL Editor as a migration.

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

-- ----------
-- Helpers
-- ----------

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

-- ----------
-- Core tables
-- ----------

create table if not exists app.tenants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_code_format check (code ~ '^[a-z0-9][a-z0-9_-]{2,32}$')
);

create table if not exists app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text,
  locale text not null default 'bg' check (locale in ('bg', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  role text not null default 'member' check (role in ('owner', 'admin', 'manager', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_tenant_user_unique unique (tenant_id, user_id)
);

create or replace function app.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from app.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function app.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from app.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role in ('owner', 'admin')
  );
$$;

-- Username unique per tenant (case-insensitive), optional
create unique index if not exists memberships_tenant_username_unique
on app.memberships (tenant_id, lower(username))
where username is not null;

create table if not exists app.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'paddle', 'manual')),
  provider_subscription_id text not null,
  plan_code text not null check (plan_code in ('monthly', 'yearly')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'incomplete', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_unique unique (provider, provider_subscription_id)
);

create index if not exists subscriptions_tenant_idx on app.subscriptions(tenant_id);
create index if not exists subscriptions_status_idx on app.subscriptions(status);

create table if not exists app.entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references app.tenants(id) on delete cascade,
  plan_code text not null check (plan_code in ('monthly', 'yearly')),
  status text not null check (status in ('active', 'grace', 'expired', 'revoked')),
  current_period_end timestamptz,
  grace_until timestamptz,
  read_only boolean not null default false,
  source_subscription_id uuid references app.subscriptions(id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  device_name text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_tenant_fingerprint_unique unique (tenant_id, device_fingerprint)
);

create index if not exists devices_tenant_idx on app.devices(tenant_id);
create index if not exists devices_user_idx on app.devices(user_id);

-- ----------
-- Timestamps
-- ----------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenants_touch_updated_at on app.tenants;
create trigger tenants_touch_updated_at
before update on app.tenants
for each row execute function app.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on app.profiles;
create trigger profiles_touch_updated_at
before update on app.profiles
for each row execute function app.touch_updated_at();

drop trigger if exists memberships_touch_updated_at on app.memberships;
create trigger memberships_touch_updated_at
before update on app.memberships
for each row execute function app.touch_updated_at();

drop trigger if exists subscriptions_touch_updated_at on app.subscriptions;
create trigger subscriptions_touch_updated_at
before update on app.subscriptions
for each row execute function app.touch_updated_at();

drop trigger if exists entitlements_touch_updated_at on app.entitlements;
create trigger entitlements_touch_updated_at
before update on app.entitlements
for each row execute function app.touch_updated_at();

drop trigger if exists devices_touch_updated_at on app.devices;
create trigger devices_touch_updated_at
before update on app.devices
for each row execute function app.touch_updated_at();

-- Optional helper: create profile row automatically for new auth users
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = app, auth, public
as $$
begin
  insert into app.profiles (user_id, email, display_name)
  values (new.id, new.email::citext, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_spi on auth.users;
create trigger on_auth_user_created_spi
after insert on auth.users
for each row execute function app.handle_new_auth_user();

-- ----------
-- RLS
-- ----------

alter table app.tenants enable row level security;
alter table app.profiles enable row level security;
alter table app.memberships enable row level security;
alter table app.subscriptions enable row level security;
alter table app.entitlements enable row level security;
alter table app.devices enable row level security;

-- tenants
drop policy if exists tenants_select_member on app.tenants;
create policy tenants_select_member
on app.tenants
for select
to authenticated
using (app.is_tenant_member(id));

drop policy if exists tenants_update_admin on app.tenants;
create policy tenants_update_admin
on app.tenants
for update
to authenticated
using (app.is_tenant_admin(id))
with check (app.is_tenant_admin(id));

-- profiles
drop policy if exists profiles_select_self on app.profiles;
create policy profiles_select_self
on app.profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists profiles_update_self on app.profiles;
create policy profiles_update_self
on app.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- memberships
drop policy if exists memberships_select_same_tenant on app.memberships;
create policy memberships_select_same_tenant
on app.memberships
for select
to authenticated
using (app.is_tenant_member(tenant_id));

drop policy if exists memberships_admin_write on app.memberships;
create policy memberships_admin_write
on app.memberships
for all
to authenticated
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

-- subscriptions
drop policy if exists subscriptions_select_member on app.subscriptions;
create policy subscriptions_select_member
on app.subscriptions
for select
to authenticated
using (app.is_tenant_member(tenant_id));

drop policy if exists subscriptions_admin_write on app.subscriptions;
create policy subscriptions_admin_write
on app.subscriptions
for all
to authenticated
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

-- entitlements
drop policy if exists entitlements_select_member on app.entitlements;
create policy entitlements_select_member
on app.entitlements
for select
to authenticated
using (app.is_tenant_member(tenant_id));

drop policy if exists entitlements_admin_write on app.entitlements;
create policy entitlements_admin_write
on app.entitlements
for all
to authenticated
using (app.is_tenant_admin(tenant_id))
with check (app.is_tenant_admin(tenant_id));

-- devices
drop policy if exists devices_select_member on app.devices;
create policy devices_select_member
on app.devices
for select
to authenticated
using (app.is_tenant_member(tenant_id));

drop policy if exists devices_insert_member on app.devices;
create policy devices_insert_member
on app.devices
for insert
to authenticated
with check (
  app.is_tenant_member(tenant_id)
  and user_id = auth.uid()
);

drop policy if exists devices_update_self_or_admin on app.devices;
create policy devices_update_self_or_admin
on app.devices
for update
to authenticated
using (
  (user_id = auth.uid() and app.is_tenant_member(tenant_id))
  or app.is_tenant_admin(tenant_id)
)
with check (
  (user_id = auth.uid() and app.is_tenant_member(tenant_id))
  or app.is_tenant_admin(tenant_id)
);

-- ----------
-- Notes
-- ----------
-- 1) Build JWT with claim tenant_id to simplify per-tenant access in client.
-- 2) Entitlement rules:
--    active/grace => read_only=false
--    expired/revoked => read_only=true
-- 3) Grace window: 10 calendar days (computed server-side, stored in grace_until).
-- 4) Use service role only in Edge Functions/webhooks, never in the app client.
