-- ==========================================
-- КОНФИГУРАЦИЯ: Кратък Grace период за тестване
-- ==========================================
-- По подразбиране grace периодът е 10 дни.
-- Този файл променя логиката за тестови цели на 1 минута.

-- ВНИМАНИЕ: Това е САМО ЗА ТЕСТВАНЕ!
-- Не използвайте в продукция!

-- ==========================================
-- Създаване на test версия на функцията с 1 минута grace
-- ==========================================

create or replace function app.refresh_entitlement_for_tenant_test_short_grace(p_tenant_id uuid)
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
    
    -- ⚠️ ТЕСТОВА ПРОМЯНА: Grace период е 1 минута вместо 10 дни
    target_grace_until := case
      when latest_sub.current_period_end is not null then latest_sub.current_period_end + interval '1 minute'
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

-- ==========================================
-- Тестова версия на entitlement_me с кратък grace
-- ==========================================

create or replace function app.entitlement_me_test_short_grace(p_tenant_id uuid default null)
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

  -- Използваме тестовата версия с 1 минута grace
  perform app.refresh_entitlement_for_tenant_test_short_grace(selected_tenant);

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
      -- Секунди вместо дни за по-точна проверка
      else greatest(0, ceil(extract(epoch from (e.grace_until - now())))::int)
    end as days_until_read_only  -- Всъщност секунди в тази версия
  from app.entitlements e
  where e.tenant_id = selected_tenant;
end;
$$;

grant execute on function app.refresh_entitlement_for_tenant_test_short_grace(uuid) to service_role;
grant execute on function app.entitlement_me_test_short_grace(uuid) to authenticated;

-- ==========================================
-- Бърз тест с кратък grace период
-- ==========================================

create or replace function app.test_short_grace_period()
returns void
language plpgsql
as $$
declare
  test_tenant_id uuid;
  test_user_id uuid;
  test_subscription_id uuid;
  test_email text := 'test.short.grace@example.com';
begin
  -- Създаване на тестов tenant
  insert into app.tenants (code, name, is_active)
  values ('test-short-grace', 'Test Short Grace Tenant', true)
  returning id into test_tenant_id;

  raise notice 'Създаден tenant ID: %', test_tenant_id;

  -- Проверка за user
  select id into test_user_id
  from auth.users
  where email = test_email;

  if test_user_id is null then
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
  end if;

  raise notice 'User ID: %', test_user_id;

  -- Profile и membership
  insert into app.profiles (user_id, email, display_name, locale)
  values (test_user_id, test_email, 'Test Short Grace User', 'bg')
  on conflict (user_id) do nothing;

  insert into app.memberships (tenant_id, user_id, username, role)
  values (test_tenant_id, test_user_id, 'testshortgrace', 'owner')
  on conflict (tenant_id, user_id) do nothing;

  -- Subscription който изтича СЕГА (вместо след 1 минута)
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
    'expired',  -- Вече изтекъл
    now() - interval '1 month',
    now() - interval '10 seconds',  -- Изтекъл преди 10 секунди
    'manual',
    'test_sub_short_grace'
  )
  returning id into test_subscription_id;

  raise notice 'Subscription ID: % (изтекъл преди 10 секунди)', test_subscription_id;

  -- Refresh с тестовата функция
  perform app.refresh_entitlement_for_tenant_test_short_grace(test_tenant_id);

  -- Проверка
  declare
    current_status text;
    current_readonly boolean;
    grace_end timestamptz;
    seconds_left int;
  begin
    select status, read_only, grace_until
    into current_status, current_readonly, grace_end
    from app.entitlements
    where tenant_id = test_tenant_id;

    seconds_left := extract(epoch from (grace_end - now()))::int;

    raise notice '';
    raise notice 'ТЕКУЩО СЪСТОЯНИЕ:';
    raise notice '  Status: % (очаквано: grace)', current_status;
    raise notice '  Read-only: % (очаквано: false)', current_readonly;
    raise notice '  Grace изтича след: % секунди', seconds_left;
    raise notice '';
    raise notice 'След ~%s, статусът ще стане "expired" и read_only ще е true', seconds_left;
    raise notice '';
    raise notice 'За проверка след изтичане:';
    raise notice '  SELECT * FROM app.test_check_short_grace_status();';
  end;
end;
$$;

-- Функция за проверка след изтичане
create or replace function app.test_check_short_grace_status()
returns table (
  tenant_code text,
  status text,
  read_only boolean,
  grace_until timestamptz,
  seconds_left int,
  test_result text
)
language plpgsql
as $$
begin
  -- Refresh всички test tenants
  perform app.refresh_entitlement_for_tenant_test_short_grace(id)
  from app.tenants
  where code in ('test-short-grace', 'test-expiry');

  return query
  select
    t.code,
    e.status,
    e.read_only,
    e.grace_until,
    extract(epoch from (e.grace_until - now()))::int,
    case
      when e.read_only = true then '✅ Read-only активиран'
      when e.status = 'grace' then '⏳ Все още в grace период'
      else '❓ Неочакван статус'
    end
  from app.tenants t
  join app.entitlements e on e.tenant_id = t.id
  where t.code in ('test-short-grace', 'test-expiry');
end;
$$;

-- Cleanup
create or replace function app.test_cleanup_short_grace()
returns void
language plpgsql
as $$
begin
  delete from app.memberships
  where tenant_id in (select id from app.tenants where code = 'test-short-grace');

  delete from app.entitlements
  where tenant_id in (select id from app.tenants where code = 'test-short-grace');

  delete from app.subscriptions
  where tenant_id in (select id from app.tenants where code = 'test-short-grace');

  delete from app.tenants
  where code = 'test-short-grace';

  raise notice 'Тестовите данни (short grace) са изтрити.';
end;
$$;

-- Възстановяване на оригиналната функция (с 10 дни grace)
create or replace function app.restore_original_grace_period()
returns void
language plpgsql
as $$
begin
  -- Тази функция не е нужна - просто използвайте оригиналните функции
  -- refresh_entitlement_for_tenant и entitlement_me
  raise notice 'За да върнете оригиналния grace период от 10 дни,';
  raise notice 'използвайте оригиналните функции:';
  raise notice '  - app.refresh_entitlement_for_tenant(tenant_id)';
  raise notice '  - app.entitlement_me(p_tenant_id)';
end;
$$;

-- Инструкции
select '╔════════════════════════════════════════════════════════════════╗' as instruction union all
select '║       КОНФИГУРАЦИЯ: Кратък Grace период (1 минута)           ║' union all
select '╠════════════════════════════════════════════════════════════════╣' union all
select '║                                                                ║' union all
select '║  Този файл създава тестови версии на функциите с 1 минута     ║' union all
select '║  grace период вместо 10 дни.                                  ║' union all
select '║                                                                ║' union all
select '║  ИЗПОЛЗВАНЕ:                                                  ║' union all
select '║                                                                ║' union all
select '║  1. Стартиране на бърз тест:                                  ║' union all
select '║     SELECT app.test_short_grace_period();                     ║' union all
select '║                                                                ║' union all
select '║  2. Изчакайте ~50 секунди                                     ║' union all
select '║                                                                ║' union all
select '║  3. Проверка на статуса:                                      ║' union all
select '║     SELECT * FROM app.test_check_short_grace_status();        ║' union all
select '║                                                                ║' union all
select '║  4. Почистване:                                               ║' union all
select '║     SELECT app.test_cleanup_short_grace();                    ║' union all
select '║                                                                ║' union all
select '║  БЕЛЕЖКА: Тези функции са САМО за тестване!                  ║' union all
select '║  Продукционната система използва 10 дни grace период.         ║' union all
select '║                                                                ║' union all
select '╚════════════════════════════════════════════════════════════════╝';
