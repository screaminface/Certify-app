-- SPI CERTIFY - Operator Quick Manual (short SQL)
-- SPI CERTIFY - Операторски бърз наръчник (кратък SQL)
-- Purpose / Цел: most-used day-to-day commands only.
-- Use after migrations 001..005.

-- ======================================================
-- 0) SET TENANT (replace once)
-- 0) НАСТРОЙ TENANT (смени веднъж)
-- ======================================================
-- Replace this UUID in all blocks below:
-- ea4d8b1d-ab2e-461f-b3ed-61b930d42906


-- ======================================================
-- 1) CURRENT STATUS CHECK
-- 1) ПРОВЕРКА НА ТЕКУЩ СТАТУС
-- ======================================================
select
  t.code,
  s.plan_code,
  s.status as subscription_status,
  s.current_period_end,
  e.status as entitlement_status,
  e.grace_until,
  e.read_only,
  e.last_synced_at
from app.tenants t
left join app.subscriptions s on s.tenant_id = t.id and s.provider = 'manual'
left join app.entitlements e on e.tenant_id = t.id
where t.id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid;


-- ======================================================
-- 2) FORCE RECOMPUTE ENTITLEMENT
-- 2) ПРЕИЗЧИСЛИ ENTITLEMENT
-- ======================================================
select app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid);


-- ======================================================
-- 3) SET ACTIVE (30 days)
-- 3) АКТИВИРАЙ (30 дни)
-- ======================================================
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'monthly',
  30,
  'manual activation'
);


-- ======================================================
-- 4) MARK PAST DUE (grace flow)
-- 4) МАРКИРАЙ PAST_DUE (гратисен поток)
-- ======================================================
select *
from app.manual_mark_unpaid(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'past_due',
  'invoice overdue'
);


-- ======================================================
-- 5) FORCE EXPIRED / LOCK NOW
-- 5) ФОРСИРАЙ EXPIRED / ЗАКЛЮЧИ СЕГА
-- ======================================================
select *
from app.manual_mark_unpaid(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'expired',
  'manual lock'
);


-- ======================================================
-- 5A) PLAN SWITCH (MONTHLY <-> YEARLY)
-- 5A) СМЯНА НА ПЛАН (MONTHLY <-> YEARLY)
-- ======================================================
-- One-block switch (recommended, NO date extension)
-- Един блок (препоръчително, БЕЗ удължаване на срок)
with params as (
  select
    'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid as tenant_id,
    'yearly'::text as target_plan
), updated as (
  update app.subscriptions s
  set plan_code = p.target_plan,
      updated_at = now()
  from params p
  where s.tenant_id = p.tenant_id
    and s.provider = 'manual'
  returning s.tenant_id, s.plan_code, s.current_period_end
)
select
  u.tenant_id,
  u.plan_code,
  u.current_period_end,
  app.refresh_entitlement_for_tenant(u.tenant_id) as refreshed
from updated u;

-- Immediate switch WITH extension / Директна смяна С удължаване
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'yearly',
  365,
  'switch to yearly (immediate)'
);

select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'monthly',
  30,
  'switch to monthly (immediate)'
);

-- Keep remaining days / Запази оставащите дни (пример: monthly -> yearly)
with remaining as (
  select greatest(
    0,
    ceil(extract(epoch from (coalesce(max(s.current_period_end), now()) - now())) / 86400.0)::int
  ) as remaining_days
  from app.subscriptions s
  where s.tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
    and s.provider = 'manual'
)
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'yearly',
  (select remaining_days + 365 from remaining),
  'switch monthly->yearly (keep remaining)'
);


-- ======================================================
-- 6) FORCE READ-ONLY TEST (grace passed)
-- 6) ТЕСТ READ-ONLY (гратисът е изтекъл)
-- ======================================================
update app.subscriptions
set status = 'past_due',
    current_period_end = now() - interval '11 day',
    updated_at = now()
where tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
  and provider = 'manual';

select app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid);


-- ======================================================
-- 7) FIND USER + MEMBERSHIP
-- 7) НАМЕРИ USER + MEMBERSHIP
-- ======================================================
select id, email, email_confirmed_at, last_sign_in_at
from auth.users
where email ilike 'owner@example.com';

select
  m.tenant_id,
  m.role,
  m.is_active,
  p.email
from app.memberships m
left join app.profiles p on p.user_id = m.user_id
where m.user_id = (
  select id from auth.users where email = 'owner@example.com'
)
order by m.created_at asc;


-- ======================================================
-- 8) UPSERT OWNER MEMBERSHIP (if missing)
-- 8) UPSERT OWNER MEMBERSHIP (ако липсва)
-- ======================================================
insert into app.memberships (tenant_id, user_id, role, is_active)
select
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  u.id,
  'owner',
  true
from auth.users u
where u.email = 'owner@example.com'
on conflict (tenant_id, user_id)
do update set
  role = excluded.role,
  is_active = true,
  updated_at = now();


-- ======================================================
-- 9) RECENT BILLING EVENTS
-- 9) ПОСЛЕДНИ BILLING СЪБИТИЯ
-- ======================================================
select
  be.created_at,
  be.provider,
  be.event_type,
  be.payload,
  be.created_by
from app.billing_events be
where be.tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
order by be.created_at desc
limit 50;


-- ======================================================
-- 10) LAST ENTITLEMENT SNAPSHOT
-- 10) ПОСЛЕДЕН ENTITLEMENT SNAPSHOT
-- ======================================================
select
  e.tenant_id,
  e.status,
  e.read_only,
  e.current_period_end,
  e.grace_until,
  e.last_synced_at,
  e.updated_at
from app.entitlements e
where e.tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid;
