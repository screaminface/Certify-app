-- ==========================================
-- 3-МИНУТЕН АВТОМАТИЧЕН ТЕСТ (БЕЗ НАМЕСА)
-- ==========================================

/*
╔════════════════════════════════════════════════════════════════╗
║  АВТОМАТИЧЕН EXPIRATION ТЕСТ - 3 МИНУТИ                       ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  ЩО ЩЕ ВИДИШ (автоматично, без да пипаш нищо):                ║
║                                                                ║
║  Минута 0-2: 🟢 Active                                        ║
║    status='active', read_only=false                            ║
║                                                                ║
║  Минута 2-3: 🟡 Grace Period                                  ║
║    status='grace', read_only=false                             ║
║    (subscription изтече, но grace period още тече)             ║
║                                                                ║
║  Минута 3+: 🔴 Expired Read-Only                              ║
║    status='expired', read_only=true                            ║
║    (grace период изтече → апп заключен!)                       ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

СТЪПКИ:
1. Изпълни ЦЕЛИЯ този файл (Run All)
2. Изчакай 30 секунди
3. Изпълнявай мониторинг заявката на всеки 30 сек
4. Наблюдавай автоматичните промени!
*/


-- ==========================================
-- ШАГ 1: Setup тестова функция (1 мин grace)
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
    
    -- ⚡ Grace period = 1 минута (не 10 дни!)
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
    tenant_id, plan_code, status, current_period_end,
    grace_until, read_only, source_subscription_id, last_synced_at
  )
  values (
    p_tenant_id, target_plan, target_status, target_period_end,
    target_grace_until, target_read_only, latest_sub.id, now()
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
-- ШАГ 2: Създаване на тестов tenant
-- ==========================================

DO $$
DECLARE
  test_tenant_id uuid;
  test_user_id uuid;
  test_email text := 'quicktest@example.com';
BEGIN
  -- Cleanup стар тест
  DELETE FROM app.memberships 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'quicktest');
  DELETE FROM app.entitlements 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'quicktest');
  DELETE FROM app.subscriptions 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'quicktest');
  DELETE FROM app.tenants WHERE code = 'quicktest';
  
  -- Създай tenant
  INSERT INTO app.tenants (code, name, is_active)
  VALUES ('quicktest', 'Quick Test 3min', true)
  RETURNING id INTO test_tenant_id;

  -- Създай/намери user
  SELECT id INTO test_user_id FROM auth.users WHERE email = test_email;
  IF test_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated', test_email,
      crypt('Test123!', gen_salt('bf')), now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      false, ''
    )
    RETURNING id INTO test_user_id;
  END IF;

  -- Profile & membership
  INSERT INTO app.profiles (user_id, email, display_name, locale)
  VALUES (test_user_id, test_email, 'Quick Test', 'bg')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO app.memberships (tenant_id, user_id, username, role)
  VALUES (test_tenant_id, test_user_id, 'quicktest', 'owner');

  -- ⚡ Subscription изтича след 2 МИНУТИ
  INSERT INTO app.subscriptions (
    tenant_id, plan_code, status,
    current_period_start, current_period_end,
    provider, provider_subscription_id
  )
  VALUES (
    test_tenant_id, 'monthly', 'active',
    now(), now() + interval '2 minutes',
    'manual', 'quicktest_sub'
  );

  -- Initial refresh
  PERFORM app.refresh_entitlement_for_tenant_test_short_grace(test_tenant_id);

  RAISE NOTICE '';
  RAISE NOTICE '✅ ТЕСТ СТАРТИРАН!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tenant ID: %', test_tenant_id;
  RAISE NOTICE 'Текущо време: %', now();
  RAISE NOTICE '';
  RAISE NOTICE '⏰ ОЧАКВАНА TIMELINE:';
  RAISE NOTICE '  Минута 0-2: Active';
  RAISE NOTICE '  Минута 2-3: Grace';
  RAISE NOTICE '  Минута 3+: Expired Read-Only';
  RAISE NOTICE '';
  RAISE NOTICE 'МОНИТОРИНГ (изпълнявай на всеки 30 сек):';
  RAISE NOTICE '  SELECT * FROM quick_test_status();';
  RAISE NOTICE '';
END $$;


-- ==========================================
-- ШАГ 3: Мониторинг функция
-- ==========================================

CREATE OR REPLACE FUNCTION quick_test_status()
RETURNS TABLE (
  elapsed_minutes numeric,
  status text,
  read_only boolean,
  seconds_until_subscription_ends int,
  seconds_until_grace_ends int,
  expected_phase text
)
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_id uuid;
  sub_start timestamptz;
BEGIN
  SELECT id INTO tenant_id FROM app.tenants WHERE code = 'quicktest';
  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'Тест не е setup-нат. Изпълни този файл първо!';
  END IF;

  -- Refresh
  PERFORM app.refresh_entitlement_for_tenant_test_short_grace(tenant_id);

  -- Get subscription start time
  SELECT current_period_start INTO sub_start
  FROM app.subscriptions s
  WHERE s.tenant_id = quick_test_status.tenant_id
  ORDER BY s.updated_at DESC LIMIT 1;

  RETURN QUERY
  SELECT
    ROUND(EXTRACT(epoch FROM (now() - sub_start)) / 60, 1) as elapsed_minutes,
    e.status,
    e.read_only,
    GREATEST(0, EXTRACT(epoch FROM (s.current_period_end - now()))::int) as seconds_until_subscription_ends,
    GREATEST(0, EXTRACT(epoch FROM (e.grace_until - now()))::int) as seconds_until_grace_ends,
    CASE
      WHEN now() < s.current_period_end THEN '🟢 Phase 1: Active (0-2 min)'
      WHEN now() >= s.current_period_end AND now() < e.grace_until THEN '🟡 Phase 2: Grace (2-3 min)'
      ELSE '🔴 Phase 3: Expired Read-Only (3+ min)'
    END as expected_phase
  FROM app.entitlements e
  JOIN app.subscriptions s ON s.tenant_id = e.tenant_id
  WHERE e.tenant_id = quick_test_status.tenant_id
  ORDER BY s.updated_at DESC LIMIT 1;
END $$;


-- ==========================================
-- ШАГ 4: Cleanup функция
-- ==========================================

CREATE OR REPLACE FUNCTION quick_test_cleanup()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM app.memberships WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'quicktest');
  DELETE FROM app.entitlements WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'quicktest');
  DELETE FROM app.subscriptions WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'quicktest');
  DELETE FROM app.tenants WHERE code = 'quicktest';
  RAISE NOTICE '✅ Тест изтрит.';
END $$;


-- ==========================================
-- INSTANT STATUS
-- ==========================================

SELECT * FROM quick_test_status();
