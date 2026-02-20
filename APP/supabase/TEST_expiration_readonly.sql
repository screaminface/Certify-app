-- ==========================================
-- ТЕСТ: Автоматично Read-Only при изтичане на срок
-- ==========================================
-- Този файл тества дали системата автоматично превключва
-- tenant-а в read-only режим когато изтече абонаментът и grace периода.

-- 1. Създаване на тестов tenant и user
do $$
declare
  test_tenant_id uuid;
  test_user_id uuid;
  test_subscription_id uuid;
  test_email text := 'test.expiry@example.com';
begin
  -- Създаване на тестов tenant
  insert into app.tenants (code, name, is_active)
  values ('test-expiry', 'Test Expiry Tenant', true)
  returning id into test_tenant_id;

  raise notice 'Създаден тестов tenant ID: %', test_tenant_id;

  -- Проверка дали user съществува в auth.users
  select id into test_user_id
  from auth.users
  where email = test_email;

  if test_user_id is null then
    -- Създаване на тестов user (само ако не съществува)
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      test_email,
      crypt('TestPassword123!', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      ''
    )
    returning id into test_user_id;

    raise notice 'Създаден тестов user ID: %', test_user_id;
  else
    raise notice 'Използва се съществуващ user ID: %', test_user_id;
  end if;

  -- Създаване на profile
  insert into app.profiles (user_id, email, display_name, locale)
  values (test_user_id, test_email, 'Test User Expiry', 'bg')
  on conflict (user_id) do nothing;

  -- Създаване на membership
  insert into app.memberships (tenant_id, user_id, username, role)
  values (test_tenant_id, test_user_id, 'testexpiry', 'owner')
  on conflict (tenant_id, user_id) do nothing;

  -- ==========================================
  -- ТЕСТ 1: Subscription изтича след 1 МИНУТА
  -- ==========================================
  raise notice '';
  raise notice '=== ТЕСТ 1: Subscription изтича след 1 минута ===';
  
  -- Създаване на subscription който изтича след 1 минута
  insert into app.subscriptions (
    tenant_id,
    plan_code,
    status,
    current_period_start,
    current_period_end,
    provider,
    provider_subscription_id
  )
  values (
    test_tenant_id,
    'monthly',
    'active',
    now(),
    now() + interval '1 minute',  -- Изтича след 1 минута
    'manual',
    'test_sub_1min'
  )
  returning id into test_subscription_id;

  raise notice 'Създаден subscription ID: % (изтича в: %)', 
    test_subscription_id, 
    (now() + interval '1 minute')::text;

  -- Refresh на entitlement
  perform app.refresh_entitlement_for_tenant(test_tenant_id);

  -- Проверка на началното състояние (трябва да е active, read_only = false)
  declare
    initial_status text;
    initial_readonly boolean;
  begin
    select status, read_only
    into initial_status, initial_readonly
    from app.entitlements
    where tenant_id = test_tenant_id;

    raise notice '';
    raise notice 'НАЧАЛНО СЪСТОЯНИЕ (сега):';
    raise notice '  Status: % (очаквано: active)', initial_status;
    raise notice '  Read-only: % (очаквано: false)', initial_readonly;
    
    if initial_status = 'active' and initial_readonly = false then
      raise notice '  ✓ УСПЕХ: Tenant е в active режим';
    else
      raise exception '  ✗ ГРЕШКА: Неочаквано начално състояние';
    end if;
  end;

  raise notice '';
  raise notice 'ЗА ДА ЗАВЪРШИТЕ ТЕСТА:';
  raise notice '1. Изчакайте 1 минута и 10 секунди';
  raise notice '2. Изпълнете следната заявка за проверка:';
  raise notice '';
  raise notice '   SELECT * FROM app.test_check_expiration_status(''%'');', test_tenant_id;
  raise notice '';
  raise notice 'Или за автоматичен тест (изчаква 70 секунди):';
  raise notice '   SELECT * FROM app.test_auto_expiration_check(''%'');', test_tenant_id;
end;
$$;

-- ==========================================
-- Функция за проверка на статуса след изтичане
-- ==========================================
create or replace function app.test_check_expiration_status(p_tenant_id uuid)
returns table (
  test_step text,
  expected_value text,
  actual_value text,
  result text
)
language plpgsql
as $$
declare
  ent_status text;
  ent_readonly boolean;
  ent_period_end timestamptz;
  ent_grace_until timestamptz;
  now_ts timestamptz := now();
  time_diff interval;
begin
  -- Refresh entitlement
  perform app.refresh_entitlement_for_tenant(p_tenant_id);

  -- Вземане на данни
  select status, read_only, current_period_end, grace_until
  into ent_status, ent_readonly, ent_period_end, ent_grace_until
  from app.entitlements
  where tenant_id = p_tenant_id;

  time_diff := now_ts - ent_period_end;

  -- Резултати
  return query select 'Време след изтичане'::text, '>1 min'::text, 
    extract(epoch from time_diff)::int || ' sec'::text,
    case when time_diff > interval '1 minute' then '✓ Pass' else '✗ Fail' end;

  return query select 'Период е изтекъл', 'да', 
    case when now_ts > ent_period_end then 'да' else 'не' end,
    case when now_ts > ent_period_end then '✓ Pass' else '✗ Fail' end;

  return query select 'Все още в grace период', 'не', 
    case when now_ts <= ent_grace_until then 'да' else 'не' end,
    case when now_ts > ent_grace_until then '✓ Pass' else '✗ Fail' end;

  return query select 'Status', 'expired', ent_status,
    case when ent_status = 'expired' then '✓ Pass' else '✗ Fail | Status: ' || ent_status end;

  return query select 'Read-only', 'true', ent_readonly::text,
    case when ent_readonly = true then '✓ Pass' else '✗ Fail | Read-only: ' || ent_readonly::text end;
end;
$$;

-- ==========================================
-- Функция за автоматична проверка (изчаква 70 сек)
-- ==========================================
create or replace function app.test_auto_expiration_check(p_tenant_id uuid)
returns table (
  message text
)
language plpgsql
as $$
declare
  ent_status text;
  ent_readonly boolean;
  wait_seconds int := 70;
begin
  return query select '⏱ Изчакване ' || wait_seconds || ' секунди...'::text;
  
  perform pg_sleep(wait_seconds);
  
  return query select '✓ Изчакването приключи. Проверка на статуса...'::text;
  
  -- Refresh entitlement
  perform app.refresh_entitlement_for_tenant(p_tenant_id);

  select status, read_only
  into ent_status, ent_readonly
  from app.entitlements
  where tenant_id = p_tenant_id;

  return query select ''::text;
  return query select 'РЕЗУЛТАТИ ОТ ТЕСТА:'::text;
  return query select '  Status: ' || ent_status || ' (очаквано: expired)';
  return query select '  Read-only: ' || ent_readonly::text || ' (очаквано: true)';
  return query select ''::text;

  if ent_status = 'expired' and ent_readonly = true then
    return query select '✅ ТЕСТ УСПЕШЕН: Tenant автоматично е превключен в read-only режим!'::text;
  else
    return query select '❌ ТЕСТ НЕУСПЕШЕН: Статусът не е коректен.'::text;
  end if;
end;
$$;

-- ==========================================
-- Клийнъп функция (изтриване на тестови данни)
-- ==========================================
create or replace function app.test_cleanup_expiration()
returns void
language plpgsql
as $$
begin
  delete from app.memberships
  where tenant_id in (select id from app.tenants where code = 'test-expiry');

  delete from app.entitlements
  where tenant_id in (select id from app.tenants where code = 'test-expiry');

  delete from app.subscriptions
  where tenant_id in (select id from app.tenants where code = 'test-expiry');

  delete from app.tenants
  where code = 'test-expiry';

  raise notice 'Тестовите данни са изтрити.';
end;
$$;

-- Инструкции
select '╔════════════════════════════════════════════════════════════════╗' as instruction union all
select '║  ТЕСТ НА АВТОМАТИЧНО READ-ONLY ПРИ ИЗТИЧАНЕ НА АБОНАМЕНТ     ║' union all
select '╠════════════════════════════════════════════════════════════════╣' union all
select '║                                                                ║' union all
select '║  Теста е стартиран! Има два начина за проверка:              ║' union all
select '║                                                                ║' union all
select '║  1. РЪЧНА ПРОВЕРКА (след 70 сек):                            ║' union all
select '║     Изчакайте 1 минута и 10 секунди, след това изпълнете:   ║' union all
select '║     SELECT * FROM app.test_check_expiration_status(           ║' union all
select '║       (SELECT id FROM app.tenants WHERE code=''test-expiry'')  ║' union all
select '║     );                                                         ║' union all
select '║                                                                ║' union all
select '║  2. АВТОМАТИЧНА ПРОВЕРКА (блокира за 70 сек):                ║' union all
select '║     SELECT * FROM app.test_auto_expiration_check(             ║' union all
select '║       (SELECT id FROM app.tenants WHERE code=''test-expiry'')  ║' union all
select '║     );                                                         ║' union all
select '║                                                                ║' union all
select '║  ПОЧИСТВАНЕ СЛЕД ТЕСТ:                                        ║' union all
select '║     SELECT app.test_cleanup_expiration();                     ║' union all
select '║                                                                ║' union all
select '╚════════════════════════════════════════════════════════════════╝';
