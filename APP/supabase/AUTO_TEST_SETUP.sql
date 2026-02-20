-- ==========================================
-- АВТОМАТИЧЕН ТЕСТ НА EXPIRATION WORKFLOW
-- ==========================================
-- Този тест ще покаже АВТОМАТИЧНИЯ преход:
-- 1. Active → Grace (след 2 минути)
-- 2. Grace → Expired Read-Only (след още 1 минута)
-- ОБЩО: 3 минути

-- ==========================================
-- СТЪПКА 1: Създаване на тестов tenant
-- ==========================================

DO $$
DECLARE
  test_tenant_id uuid;
  test_user_id uuid;
  test_email text := 'autotest@example.com';
BEGIN
  -- Изтрий стар тестов tenant ако съществува
  DELETE FROM app.memberships 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'autotest');
  
  DELETE FROM app.entitlements 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'autotest');
  
  DELETE FROM app.subscriptions 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'autotest');
  
  DELETE FROM app.tenants WHERE code = 'autotest';
  
  -- Създай нов тестов tenant
  INSERT INTO app.tenants (code, name, is_active)
  VALUES ('autotest', 'Auto Test Tenant', true)
  RETURNING id INTO test_tenant_id;

  RAISE NOTICE '✅ Създаден тестов tenant: %', test_tenant_id;

  -- Намери или създай тестов user
  SELECT id INTO test_user_id
  FROM auth.users
  WHERE email = test_email;

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
      crypt('TestPass123!', gen_salt('bf')), now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      false, ''
    )
    RETURNING id INTO test_user_id;
  END IF;

  -- Създай profile и membership
  INSERT INTO app.profiles (user_id, email, display_name, locale)
  VALUES (test_user_id, test_email, 'Auto Test User', 'bg')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO app.memberships (tenant_id, user_id, username, role)
  VALUES (test_tenant_id, test_user_id, 'autotest', 'owner');

  -- ⚡ КЛЮЧОВА СТЪПКА: Subscription който изтича след 2 МИНУТИ
  INSERT INTO app.subscriptions (
    tenant_id,
    plan_code,
    status,
    current_period_start,
    current_period_end,
    provider,
    provider_subscription_id
  )
  VALUES (
    test_tenant_id,
    'monthly',
    'active',  -- Активен СЕГА
    now(),
    now() + interval '2 minutes',  -- ⏰ Изтича след 2 минути
    'manual',
    'test_auto_sub'
  );

  RAISE NOTICE '⏰ Subscription изтича след 2 минути';

  -- ⚠️ ВАЖНО: Refresh с ТЕСТОВАТА функция (1 минута grace вместо 10 дни)
  -- Трябва да изпълниш TEST_short_grace_period.sql ПРЕДИ този файл!
  PERFORM app.refresh_entitlement_for_tenant_test_short_grace(test_tenant_id);

  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║  ТЕСТОВ TENANT СЪЗДАДЕН                                   ║';
  RAISE NOTICE '╠════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║  Tenant ID: %                                             ║', test_tenant_id;
  RAISE NOTICE '║  Email: autotest@example.com                               ║';
  RAISE NOTICE '║  Password: TestPass123!                                    ║';
  RAISE NOTICE '║                                                            ║';
  RAISE NOTICE '║  TIMELINE (с тестова функция - 1 мин grace):              ║';
  RAISE NOTICE '║  🟢 СЕГА: Active (status=active, read_only=false)         ║';
  RAISE NOTICE '║  ⏰ След 2 мин: Grace (status=grace, read_only=false)     ║';
  RAISE NOTICE '║  🔴 След 3 мин: Expired (status=expired, read_only=true)  ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'КАК ДА НАБЛЮДАВАШ:';
  RAISE NOTICE '1. Sign in като autotest@example.com в апп-а';
  RAISE NOTICE '2. Изпълнявай мониторинг заявката на всеки 30 секунди';
  RAISE NOTICE '3. Апп-ът автоматично проверява на всеки 2 минути';
  RAISE NOTICE '';
  RAISE NOTICE 'МОНИТОРИНГ ЗАЯВКА:';
  RAISE NOTICE '  SELECT * FROM auto_test_monitor();';
END $$;


-- ==========================================
-- СТЪПКА 2: Monitoring функция
-- ==========================================

CREATE OR REPLACE FUNCTION auto_test_monitor()
RETURNS TABLE (
  time_now timestamptz,
  status text,
  read_only boolean,
  subscription_ends timestamptz,
  grace_ends timestamptz,
  seconds_until_subscription_ends int,
  seconds_until_grace_ends int,
  expected_state text
)
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_id uuid;
BEGIN
  -- Намери тестовия tenant
  SELECT id INTO tenant_id
  FROM app.tenants
  WHERE code = 'autotest';

  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'Тестов tenant не е намерен. Изпълни AUTO_TEST_SETUP.sql първо.';
  END IF;

  -- Refresh entitlement with TEST функция (1 минута grace)
  PERFORM app.refresh_entitlement_for_tenant_test_short_grace(tenant_id);

  -- Върни статус
  RETURN QUERY
  SELECT
    now() as time_now,
    e.status,
    e.read_only,
    s.current_period_end as subscription_ends,
    e.grace_until as grace_ends,
    GREATEST(0, EXTRACT(epoch FROM (s.current_period_end - now()))::int) as seconds_until_subscription_ends,
    GREATEST(0, EXTRACT(epoch FROM (e.grace_until - now()))::int) as seconds_until_grace_ends,
    CASE
      WHEN now() < s.current_period_end THEN '🟢 Active (subscription active)'
      WHEN now() >= s.current_period_end AND now() < e.grace_until THEN '🟡 Grace (subscription expired, grace period active)'
      ELSE '🔴 Expired Read-Only (grace period expired)'
    END as expected_state
  FROM app.entitlements e
  JOIN app.subscriptions s ON s.tenant_id = e.tenant_id
  WHERE e.tenant_id = auto_test_monitor.tenant_id
  ORDER BY s.updated_at DESC
  LIMIT 1;
END $$;


-- ==========================================
-- СТЪПКА 3: Cleanup функция
-- ==========================================

CREATE OR REPLACE FUNCTION auto_test_cleanup()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM app.memberships 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'autotest');
  
  DELETE FROM app.entitlements 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'autotest');
  
  DELETE FROM app.subscriptions 
  WHERE tenant_id IN (SELECT id FROM app.tenants WHERE code = 'autotest');
  
  DELETE FROM app.tenants WHERE code = 'autotest';
  
  RAISE NOTICE '✅ Тестовият tenant е изтрит.';
END $$;


-- ==========================================
-- ИНСТРУКЦИИ
-- ==========================================

SELECT '╔════════════════════════════════════════════════════════════════╗' as instruction UNION ALL
SELECT '║       АВТОМАТИЧЕН ТЕСТ НА EXPIRATION WORKFLOW                 ║' UNION ALL
SELECT '╠════════════════════════════════════════════════════════════════╣' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  TIMELINE (автоматичен, без твоя намеса):                     ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  Минута 0: Active (subscription активен)                      ║' UNION ALL
SELECT '║  Минута 2: Grace (subscription изтече, grace период тече)     ║' UNION ALL
SELECT '║  Минута 3: Expired Read-Only (grace изтече, апп locked)       ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  ПРЕДВАРИТЕЛНА СТЪПКА:                                        ║' UNION ALL
SELECT '║  ⚠️  Изпълни TEST_short_grace_period.sql ПЪРВО!               ║' UNION ALL
SELECT '║     (създава тестовата функция с 1 минута grace)              ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  ИЗПОЛЗВАНЕ:                                                  ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  1. Изпълни този файл (AUTO_TEST_SETUP.sql) - създава tenant ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  2. Наблюдавай на всеки 30 секунди:                           ║' UNION ALL
SELECT '║     SELECT * FROM auto_test_monitor();                        ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  3. (Опционално) Sign in в апп-а като autotest@example.com   ║' UNION ALL
SELECT '║     Password: TestPass123!                                     ║' UNION ALL
SELECT '║     ⚠️  UI НЕ ще покаже промените автоматично!                ║' UNION ALL
SELECT '║     (апп-ът използва продукционната функция, не тестовата)    ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '║  4. След теста - изтрий тестовия tenant:                      ║' UNION ALL
SELECT '║     SELECT auto_test_cleanup();                                ║' UNION ALL
SELECT '║                                                                ║' UNION ALL
SELECT '╚════════════════════════════════════════════════════════════════╝';
