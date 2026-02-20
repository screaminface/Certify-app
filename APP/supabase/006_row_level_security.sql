-- SPI CERTIFY - Row Level Security (RLS) Policies
-- КРИТИЧНО ЗА СИГУРНОСТ: Прилагане на RLS за защита на multi-tenant данни
-- Run this SQL in Supabase SQL Editor AFTER migrations 001-005

-- =====================================================
-- ВАЖНО: Прочетете преди прилагане!
-- =====================================================
-- RLS (Row Level Security) гарантира, че потребителите виждат
-- САМО данните на своя tenant, дори при SQL injection атака.
--
-- Без RLS: JWT token може да види ВСИЧКИ tenants
-- С RLS: JWT token вижда САМО своя tenant
--
-- СТЪПКИ:
-- 1. Прегледайте policies-ите по-долу
-- 2. Прилагайте ги в Supabase SQL Editor
-- 3. Тествайте с различни потребители
-- 4. Мониторирайте за грешки в Authentication → Users
-- =====================================================

-- =====================================================
-- A) ENABLE RLS НА ВСИЧКИ ТАБЛИЦИ
-- =====================================================

-- Tenants table
ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;

-- Subscriptions table (billing data)
ALTER TABLE app.subscriptions ENABLE ROW LEVEL SECURITY;

-- Entitlements table (access control)
ALTER TABLE app.entitlements ENABLE ROW LEVEL SECURITY;

-- Memberships table (user-tenant relationships)
ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;

-- Profiles table (user metadata)
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;

-- Devices table (optional)
ALTER TABLE app.devices ENABLE ROW LEVEL SECURITY;

-- Billing events table (audit trail)
ALTER TABLE app.billing_events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- B) PROFILES TABLE - Потребителите виждат само своя профил
-- =====================================================

CREATE POLICY "Users can view their own profile"
ON app.profiles
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON app.profiles
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON app.profiles
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- =====================================================
-- C) MEMBERSHIPS TABLE - Достъп само до свои memberships
-- =====================================================

CREATE POLICY "Users can view their own memberships"
ON app.memberships
FOR SELECT
USING (user_id = auth.uid());

-- Admins/Owners могат да добавят нови членове в своя tenant
CREATE POLICY "Tenant admins can manage memberships"
ON app.memberships
FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND is_active = true
  )
);

-- =====================================================
-- D) TENANTS TABLE - Виждаш само tenants където си член
-- =====================================================

CREATE POLICY "Users can view their own tenants"
ON app.tenants
FOR SELECT
USING (
  id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid()
      AND is_active = true
  )
);

-- Само owners могат да променят tenant настройки
CREATE POLICY "Tenant owners can update tenant"
ON app.tenants
FOR UPDATE
USING (
  id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid() 
      AND role = 'owner'
      AND is_active = true
  )
)
WITH CHECK (
  id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid() 
      AND role = 'owner'
      AND is_active = true
  )
);

-- =====================================================
-- E) SUBSCRIPTIONS TABLE - КРИТИЧНО: Billing данни
-- =====================================================

-- Потребителите виждат само subscriptions на своите tenants
CREATE POLICY "Users can view their tenant subscriptions"
ON app.subscriptions
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid()
      AND is_active = true
  )
);

-- САМО owners могат да променят subscriptions (за manual billing)
CREATE POLICY "Tenant owners can manage subscriptions"
ON app.subscriptions
FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid() 
      AND role = 'owner'
      AND is_active = true
  )
);

-- =====================================================
-- F) ENTITLEMENTS TABLE - Access control data
-- =====================================================

-- Всеки вижда само entitlements на своите tenants
CREATE POLICY "Users can view their tenant entitlements"
ON app.entitlements
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid()
      AND is_active = true
  )
);

-- Entitlements се управляват от server-side функции (security definer)
-- Не е нужна UPDATE policy за потребители

-- =====================================================
-- G) DEVICES TABLE - Optional device tracking
-- =====================================================

CREATE POLICY "Users can view their own devices"
ON app.devices
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own devices"
ON app.devices
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own devices"
ON app.devices
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Tenant admins могат да виждат всички devices в своя tenant
CREATE POLICY "Tenant admins can view tenant devices"
ON app.devices
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND is_active = true
  )
);

-- =====================================================
-- H) BILLING EVENTS TABLE - Audit trail (read-only за users)
-- =====================================================

-- Потребителите виждат само billing events на своите tenants
CREATE POLICY "Users can view their tenant billing events"
ON app.billing_events
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid()
      AND is_active = true
  )
);

-- Billing events се създават от server-side функции
-- Потребителите НЕ могат директно да добавят/променят billing events

-- =====================================================
-- I) SECURITY DEFINER ФУНКЦИИ - Bypass RLS за admin operations
-- =====================================================

-- Вашите функции app.manual_set_paid_until и app.refresh_entitlement_for_tenant
-- вече са създадени с SECURITY DEFINER, което им позволява да заобикалят RLS
-- и да правят admin операции.

-- Проверете дали функциите имат правилните permissions:
-- GRANT EXECUTE ON FUNCTION app.manual_set_paid_until TO authenticated;
-- GRANT EXECUTE ON FUNCTION app.refresh_entitlement_for_tenant TO authenticated;

-- =====================================================
-- J) ТЕСТВАНЕ
-- =====================================================

-- След прилагане на policies, тествайте:

-- 1. Влезте като User A (tenant 1)
-- 2. Опитайте: SELECT * FROM app.subscriptions;
-- 3. Трябва да видите САМО subscriptions на tenant 1

-- 4. Влезте като User B (tenant 2)
-- 5. Опитайте: SELECT * FROM app.subscriptions;
-- 6. Трябва да видите САМО subscriptions на tenant 2

-- 7. Опитайте да прочетете tenant ID на друг потребител:
--    SELECT * FROM app.tenants WHERE id = 'чужд-tenant-id';
--    Резултат: празно (нямате достъп)

-- =====================================================
-- K) MONITORING И TROUBLESHOOTING
-- =====================================================

-- Проверете активни policies:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'app'
ORDER BY tablename, policyname;

-- Проверете дали RLS е активиран:
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'app'
ORDER BY tablename;

-- Ако искате временно да DEAKTIVATE RLS за debugging:
-- ALTER TABLE app.subscriptions DISABLE ROW LEVEL SECURITY;
-- ВАЖНО: НЕ забравяйте да го включите обратно след debugging!

-- =====================================================
-- L) ДОПЪЛНИТЕЛНИ ПРЕПОРЪКИ
-- =====================================================

-- 1. API Keys Rotation:
--    Ротирайте Supabase anon key на всеки 3-6 месеца
--    Dashboard → Settings → API → Regenerate anon key

-- 2. JWT Expiry:
--    Dashboard → Authentication → Settings
--    Препоръчвам: JWT expiry = 7 days (по-малко = по-сигурно)

-- 3. Email Verification:
--    Dashboard → Authentication → Settings
--    Enable "Confirm email" за нови регистрации

-- 4. Rate Limiting:
--    Supabase има вградено rate limiting на auth endpoints
--    Проверете дали е активирано в Dashboard → Settings

-- 5. Audit Logging:
--    Мониторирайте app.billing_events за подозрителна активност
--    Настройте alerts за множество неуспешни login опити

-- =====================================================
-- M) EMERGENCY: Ако нещо се обърка
-- =====================================================

-- Ако RLS блокира легитимни потребители:

-- 1. Проверете memberships (замените с реален tenant_id):
-- SELECT m.*, p.email 
-- FROM app.memberships m
-- LEFT JOIN app.profiles p ON p.user_id = m.user_id
-- WHERE m.tenant_id = '00000000-0000-0000-0000-000000000000'; -- ЗАМЕНИ с реален UUID!

-- 2. Проверете auth.users (замените с реален email):
-- SELECT id, email, email_confirmed_at, last_sign_in_at
-- FROM auth.users
-- WHERE email = 'user@example.com'; -- ЗАМЕНИ с реален email!

-- 3. Ако membership липсва, добавете го (от OPS_manual_billing_quick.sql):
-- (виж B1 секция в OPS файла)

-- =====================================================
-- ГОТОВО! RLS е активирано и защитено.
-- =====================================================
