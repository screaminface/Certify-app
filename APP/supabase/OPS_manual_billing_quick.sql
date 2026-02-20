-- SPI CERTIFY - Оперативен наръчник (бърз SQL)
-- SPI CERTIFY - Operations Manual (quick SQL)
-- Използвайте след прилагане на миграции 001, 002, 003, 004, 005.
-- Use after migrations 001, 002, 003, 004, 005 are applied.
-- Този файл е toolbox: пускайте само нужния блок.
-- This file is a toolbox: run only the block you need.
-- Заменете tenant code/email/uuid където е отбелязано.
-- Replace tenant code/email/uuid where noted.

-- ======================================================
-- A) ПРОВЕРКА НА TENANT + ПОТРЕБИТЕЛ
-- A) TENANT + USER LOOKUP
-- ======================================================

-- A1) Намери tenant по код
-- A1) Find tenant by code
select id, code, name
from app.tenants
where code = 'spi-demo';

-- A2) Намери auth user по имейл (за membership management)
-- A2) Find auth user by email (for membership management)
select id, email, created_at
from auth.users
where email ilike 'ventsi.vutov@gmail.com';

-- A3) Списък memberships за tenant
-- A3) List memberships for tenant
select
  m.id,
  m.role,
  m.is_active,
  m.username,
  m.created_at,
  p.email,
  p.display_name
from app.memberships m
left join app.profiles p on p.user_id = m.user_id
where m.tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
order by m.created_at asc;

-- ======================================================
-- B) УПРАВЛЕНИЕ НА MEMBERSHIP
-- B) MEMBERSHIP MANAGEMENT
-- ======================================================

-- B1) Добави потребител в tenant като member/admin/owner
-- B1) Add user to tenant as member/admin/owner
-- БЕЛЕЖКА: смени email + tenant code.
-- NOTE: replace email + tenant code.
insert into app.memberships (tenant_id, user_id, role, username, is_active)
select
  t.id,
  u.id,
  'member',
  null,
  true
from app.tenants t
join auth.users u on u.email = 'new.user@example.com'
where t.code = 'spi-demo'
on conflict (tenant_id, user_id)
do update set
  role = excluded.role,
  is_active = true,
  updated_at = now();

-- B2) Смени role на съществуващ член
-- B2) Change role for existing member
update app.memberships
set role = 'admin', updated_at = now()
where tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
  and user_id = (
    select id from auth.users where email = 'new.user@example.com'
  );

-- B3) Деактивирай член (запазва история)
-- B3) Deactivate member (keeps history)
update app.memberships
set is_active = false, updated_at = now()
where tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
  and user_id = (
    select id from auth.users where email = 'new.user@example.com'
  );

-- ======================================================
-- C) СТАТУС НА АБОНАМЕНТ + ENTITLEMENT
-- C) SUBSCRIPTION + ENTITLEMENT STATUS
-- ======================================================

-- C1) Провери текущ subscription + entitlement
-- C1) Check current subscription + entitlement
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

-- C2) Пресметни entitlement отново за един tenant
-- C2) Recompute entitlement for one tenant
select app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid);

-- C3) Пресметни entitlement отново за ВСИЧКИ tenants
-- C3) Recompute entitlements for ALL tenants
do $$
declare
  rec record;
begin
  for rec in select id from app.tenants loop
    perform app.refresh_entitlement_for_tenant(rec.id);
  end loop;
end $$;

-- БЕЛЕЖКА: app.entitlement_me(...) изисква автентикирана клиентска сесия.
-- NOTE: app.entitlement_me(...) requires authenticated client session.
-- В SQL Editor използвайте app.entitlements таблицата + refresh функцията.
-- In SQL Editor use app.entitlements table + refresh function.

-- ======================================================
-- D) BILLING ДЕЙСТВИЯ (РЪЧНО)
-- D) BILLING ACTIONS (MANUAL)
-- ======================================================

-- D1) Запиши плащане / удължи период (месечен)
-- D1) Record payment / extend period (monthly)
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'monthly',
  30,
  'bank transfer'
);

-- D2) Запиши плащане / удължи период (годишен)
-- D2) Record payment / extend period (yearly)
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'yearly',
  365,
  'annual payment'
);

-- D3) Маркирай неплатен/просрочен (grace или expired според датите)
-- D3) Mark unpaid/overdue (grace or expired depends on dates)
select *
from app.manual_mark_unpaid(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'past_due',
  'invoice overdue'
);

-- D4) Форсирай незабавно заключване
-- D4) Force immediate lock
-- ВАЖНО: За пълно заключване трябва status='expired' И current_period_end да е в миналото
-- IMPORTANT: For full lock need status='expired' AND current_period_end in the past
select *
from app.manual_mark_unpaid(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'expired',
  'manual lock'
);

-- ДОПЪЛНИТЕЛНО: Ако горното не форсира read_only, ръчно сетнете период в миналото:
-- ADDITIONAL: If above doesn't force read_only, manually set period to past:
update app.subscriptions
set status = 'expired',
    current_period_end = now() - interval '1 day',
    updated_at = now()
where tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
  and provider = 'manual';

select app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid);

-- D5) Форсирай read-only за тест (past_due, grace вече е изтекъл)
-- D5) Force read-only for test (past due, grace already passed)
update app.subscriptions
set status = 'past_due',
    current_period_end = now() - interval '11 day',
    updated_at = now()
where tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
  and provider = 'manual';

select app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid);

-- D6) Върни tenant в active веднага (30 дни)
-- D6) Return tenant to active immediately (30 days)
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'monthly',
  30,
  'unlock after test'
);

-- D6A) ЕДИН УНИВЕРСАЛЕН БЛОК ЗА СМЯНА НА ПЛАН (БЕЗ промяна на краен срок)
-- D6A) ONE UNIVERSAL PLAN-SWITCH BLOCK (WITHOUT changing period end)
-- Ползвай това за чиста смяна monthly <-> yearly.
-- Use this for pure plan switch monthly <-> yearly.
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

-- Примери / Examples:
-- target_plan='yearly'  -> сменя на yearly, запазва крайния срок
-- target_plan='monthly' -> сменя на monthly, запазва крайния срок

-- ВАЖНО / IMPORTANT:
-- D7..D11 по-долу са BILLING операции (удължават периода) и не са "чиста смяна на план".
-- D7..D11 below are BILLING operations (extend period) and are not a "pure plan switch".

-- D7) Смени план на ГОДИШЕН (директно: нови 365 дни)
-- D7) Switch plan to YEARLY (immediate: new 365 days)
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'yearly',
  365,
  'plan switch to yearly (immediate)'
);

-- D8) Смени план на МЕСЕЧЕН (директно: нови 30 дни)
-- D8) Switch plan to MONTHLY (immediate: new 30 days)
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'monthly',
  30,
  'plan switch to monthly (immediate)'
);

-- D9) Смени monthly -> yearly със ЗАПАЗВАНЕ на оставащите дни
-- D9) Switch monthly -> yearly and KEEP remaining days
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
  'plan switch monthly->yearly (keep remaining)'
);

-- D10) Смени yearly -> monthly със ЗАПАЗВАНЕ на оставащите дни
-- D10) Switch yearly -> monthly and KEEP remaining days
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
  'monthly',
  (select remaining_days + 30 from remaining),
  'plan switch yearly->monthly (keep remaining)'
);

-- D11) Добави X месеца към текущ monthly план (пример: 3 месеца)
-- D11) Top-up X months on monthly plan (example: 3 months)
select *
from app.manual_set_paid_until(
  'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid,
  'monthly',
  90,
  'monthly top-up 3 months'
);

-- ======================================================
-- E) УПРАВЛЕНИЕ НА УСТРОЙСТВА (ПО ЖЕЛАНИЕ)
-- E) DEVICES MANAGEMENT (OPTIONAL)
-- ======================================================

-- E1) Списък устройства за tenant
-- E1) List devices for tenant
select
  d.id,
  d.device_name,
  d.device_fingerprint,
  d.app_version,
  d.last_seen_at,
  d.revoked_at,
  p.email
from app.devices d
left join app.profiles p on p.user_id = d.user_id
where d.tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906'::uuid
order by d.last_seen_at desc;

-- E2) Ревокирай устройство
-- E2) Revoke device
update app.devices
set revoked_at = now(), updated_at = now()
where id = '00000000-0000-0000-0000-000000000000'::uuid;

-- E3) Премахни ревокация на устройство
-- E3) Unrevoke device
update app.devices
set revoked_at = null, updated_at = now()
where id = '00000000-0000-0000-0000-000000000000'::uuid;

-- ======================================================
-- F) AUDIT ИСТОРИЯ
-- F) AUDIT TRAIL
-- ======================================================

-- F1) Последни billing събития
-- F1) Recent billing events
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

-- F2) Последни entitlement промени
-- F2) Last entitlement changes
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

-- ======================================================
-- G) AUTH / PASSWORD RECOVERY TROUBLESHOOTING (ДИАГНОСТИКА)
-- G) AUTH / PASSWORD RECOVERY TROUBLESHOOTING
-- ======================================================

-- G1) Провери дали auth user съществува + confirmed
-- G1) Check auth user exists + confirmed
select id, email, email_confirmed_at, last_sign_in_at
from auth.users
where email ilike 'owner@example.com';

-- G2) Провери user membership в tenant (задължително за entitlement)
-- G2) Check user membership in tenant (required for entitlement)
select
  m.tenant_id,
  m.role,
  m.is_active,
  p.email
from app.memberships m
left join app.profiles p on p.user_id = m.user_id
where m.user_id = (
  select id from auth.users where email = 'ventsi.vutov@gmail.com'
)
order by m.created_at asc;

-- G3) Бърз upsert на membership (ако липсва)
-- G3) Upsert membership quickly (if missing)
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

-- G4) Бележки за recovery линкове (чеклист)
-- G4) Notes for recovery links (manual checklist)
-- - Supabase Auth URL Configuration трябва да включва:
-- - Supabase Auth URL Configuration should include:
--   Site URL: http://localhost:5173/Certify-app/
--   Redirect URLs: http://localhost:5173/**, http://localhost:5174/**, http://localhost:5175/**,
--                  http://localhost:5173/Certify-app/**
-- - Recovery линковете са еднократни и могат да изтичат бързо (otp_expired).
-- - Recovery links are one-time and can expire quickly (otp_expired).
-- - Ако линкът се отвори с /Certify-app#... вместо /Certify-app/#..., добавете наклонената черта и презаредете.
-- - If link opens with /Certify-app#... instead of /Certify-app/#..., add the slash and reload.
-- - Ползвайте само най-новия recovery линк от имейл.
-- - Use the newest recovery email link only.
