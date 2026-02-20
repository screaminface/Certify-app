-- ==========================================
-- ЯСНИ СТЪПКИ ЗА ТЕСТВАНЕ
-- ==========================================

-- ============================================
-- ТЕСТ 1: ENTITLEMENT READ-ONLY (Grace Period)
-- ============================================

-- СТЪПКА 1: Виж текущия статус
SELECT 
  status, 
  read_only, 
  grace_until,
  current_period_end,
  extract(epoch from (grace_until - now()))::int as seconds_until_readonly
FROM app.entitlements
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';

-- СТЪПКА 2: Задай grace_until да изтече след 30 секунди
UPDATE app.entitlements 
SET grace_until = now() + interval '30 seconds'
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';

-- СТЪПКА 3: Провери отново
SELECT 
  status, 
  read_only, 
  grace_until,
  extract(epoch from (grace_until - now()))::int as seconds_until_readonly
FROM app.entitlements
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';

-- СТЪПКА 4: Изчакай 35 секунди

-- СТЪПКА 5: REFRESH (ръчно извикване на функцията)
SELECT app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906');

-- СТЪПКА 6: Провери дали е станал read_only=true
SELECT 
  status, 
  read_only, 
  grace_until,
  extract(epoch from (grace_until - now()))::int as seconds_until_readonly
FROM app.entitlements
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';
-- Очакван резултат: status='expired', read_only=true

-- СТЪПКА 7: REFRESH В APP (в браузъра)
-- F5 на апп-а или изчакай 2 минути за background refresh
-- UI ще се заключи (само четене)

-- СТЪПКА 8: RESTORE след теста
UPDATE app.subscriptions 
SET current_period_end = now() + interval '30 days'
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';

SELECT app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906');

-- Провери че е възстановен
SELECT status, read_only FROM app.entitlements
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';
-- Очакван резултат: status='active', read_only=false


-- ============================================
-- ТЕСТ 2: JWT TOKEN AUTO-LOGOUT (отделен тест)
-- ============================================

-- JWT token не се променя от SQL!
-- Той се конфигурира от Supabase Dashboard:

-- 1. Отвори: Supabase Project → Settings → Auth → JWT Expiry
-- 2. Промени от 3600 на 60 (1 минута)
-- 3. Sign In в апп-а
-- 4. Изчакай 65 секунди
-- 5. Направи някаква операция (кликни бутон)
-- 6. Ще видиш: Auth error → auto sign out

-- ⚠️ ЗА PRODUCTION: Върни JWT Expiry обратно на 3600!


-- ============================================
-- ОБЯСНЕНИЕ НА РАЗЛИКИТЕ
-- ============================================

/*
┌─────────────────────────────────────────────────────────────────┐
│  JWT TOKEN EXPIRY          vs.   ENTITLEMENT GRACE PERIOD       │
├─────────────────────────────────────────────────────────────────┤
│  Authentication level            Business logic level           │
│  Supabase auth system            Custom app logic               │
│  Default: 1 hour                 Default: 10 days               │
│  Config: Dashboard               Config: Database               │
│  Effect: Auto sign out           Effect: Read-only mode         │
│  Check: Every API call           Check: Every 2 min (app)       │
└─────────────────────────────────────────────────────────────────┘

ВАЖНО:
- JWT token е за SECURITY (колко време user е authenticated)
- Grace period е за BILLING (колко време след изтичане на subscription)
- JWT може да изтече докато subscription е active
- Subscription може да изтече докато JWT е валиден
- Това са независими механизми!
*/


-- ============================================
-- БЪРЗ ТЕСТ (30 секунди вместо минути)
-- ============================================

-- Ако искаш ултра-бърз тест:

-- 1. Задай grace_until = now (без чакане)
UPDATE app.entitlements 
SET grace_until = now() - interval '1 second'
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';

-- 2. Refresh функцията
SELECT app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906');

-- 3. Виж резултата веднага
SELECT status, read_only, grace_until
FROM app.entitlements
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';
-- status='expired', read_only=true

-- 4. F5 в браузъра за да видиш UI locked

-- 5. Restore
UPDATE app.subscriptions 
SET current_period_end = now() + interval '30 days'
WHERE tenant_id = 'ea4d8b1d-ab2e-461f-b3ed-61b930d42906';

SELECT app.refresh_entitlement_for_tenant('ea4d8b1d-ab2e-461f-b3ed-61b930d42906');
