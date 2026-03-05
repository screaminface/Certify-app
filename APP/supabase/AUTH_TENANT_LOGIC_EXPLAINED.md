# 🔐 SUPABASE AUTH & MULTI-TENANT ЛОГИКА - ОБЯСНЕНИЕ

## 📊 ТЕКУЩА АРХИТЕКТУРА

### 1. **Три основни концепции:**

```
┌─────────────────┐
│  AUTH.USERS     │ ← Supabase Authentication (email + password)
│  (Потребители)  │
└────────┬────────┘
         │
         │ user_id
         │
┌────────▼────────┐
│  APP.PROFILES   │ ← Допълнителна информация за потребителя
│  (Профили)      │   (display_name, locale, etc.)
└─────────────────┘

┌─────────────────┐
│  APP.TENANTS    │ ← Компании/Организации (SPI Demo, Alpha Security, etc.)
│  (Фирми)        │
└────────┬────────┘
         │
         │ tenant_id
         │
┌────────▼────────────────┐
│  APP.MEMBERSHIPS        │ ← Връзка: Кой потребител принадлежи на коя компания
│  (Членства)             │   user_id + tenant_id + role (owner/admin/member)
└─────────────────────────┘

┌─────────────────┐
│  APP.SUBSCRIPTIONS │ ← Абонамент на компанията (monthly/yearly)
│  (Абонаменти)      │   + status (active/expired/etc.)
└────────┬───────────┘
         │
         │
┌────────▼───────────┐
│  APP.ENTITLEMENTS  │ ← Права на достъп (read_only/active)
│  (Права)           │   Автоматично изчислявани от subscription
└────────────────────┘
```

---

## ⚠️ ПРОБЛЕМ С ТЕКУЩАТА ЛОГИКА

### **Когато се създава нова фирма (tenant):**

#### ✅ Какво работи:
1. **APP-ADMIN** → Създава нова компания чрез `admin_create_tenant()`
2. Автоматично се създават:
   - `app.tenants` запис (фирмата)
   - `app.subscriptions` запис (абонамент 30/365 дни)
   - `app.entitlements` запис (права active/read-only)

#### ❌ Какво НЕ работи:
**НЕ се създава автоматично потребител който може да влезе в апп-а!**

**Проблемите:**
1. **Няма auth.users запис** → няма email/password за логин
2. **Няма app.profiles запис** → няма профил информация
3. **Няма app.memberships запис** → няма връзка user ↔ tenant

**Резултат:** Създаваш компания "Alpha Security" но няма кой да влезе в апп-а!

---

## 🔧 ТЕКУЩ WORKAROUND (ръчен процес)

За да работи една компания, трябва 3 РЪЧНИ стъпки:

### Стъпка 1: Създай Auth User (Supabase Dashboard)
```
Authentication → Users → Add user
Email: owner@alpha-security.com
Password: StrongPassword123!
Auto Confirm User: ✓
```

### Стъпка 2: Копирай UUID на потребителя
```sql
SELECT id, email FROM auth.users WHERE email = 'owner@alpha-security.com';
-- → id: abc123-def456-...
```

### Стъпка 3: Добави membership ръчно
```sql
INSERT INTO app.memberships (tenant_id, user_id, role, is_active)
SELECT 
    (SELECT id FROM app.tenants WHERE code = 'alpha-security'),
    'abc123-def456-...',  -- user UUID от Стъпка 2
    'owner',
    true;
```

**Това е ТВЪРДЕ сложно и грешки-prone!**

---

## 🎯 ПРЕДЛОЖЕНИ РЕШЕНИЯ

### **Вариант 1: Full Auto-Registration (Препоръчвам)**

Когато се създава tenant, автоматично да се създава и owner акаунт:

```sql
CREATE OR REPLACE FUNCTION public.admin_create_tenant_with_owner(
  p_tenant_name text,
  p_tenant_code text,
  p_owner_email text,
  p_owner_password text,  -- АВТОМАТИЧНА ПАРОЛА или ГЕНЕРИРАНА
  p_plan_code text DEFAULT 'monthly',
  p_days int DEFAULT 30
)
RETURNS json
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid;
  v_temp_password text;
BEGIN
  -- 1) Създай auth user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_owner_email,
    crypt(p_owner_password, gen_salt('bf')),  -- HASH PASSWORD
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO v_user_id;

  -- 2) Създай profile
  INSERT INTO app.profiles (user_id, email, display_name, locale)
  VALUES (v_user_id, p_owner_email, p_tenant_name, 'bg');

  -- 3) Създай tenant
  INSERT INTO app.tenants (code, name, is_active)
  VALUES (p_tenant_code, p_tenant_name, true)
  RETURNING id INTO v_tenant_id;

  -- 4) Създай membership (owner)
  INSERT INTO app.memberships (tenant_id, user_id, role, is_active)
  VALUES (v_tenant_id, v_user_id, 'owner', true);

  -- 5) Създай subscription + entitlement
  INSERT INTO app.subscriptions (
    tenant_id, provider, plan_code, status,
    current_period_start, current_period_end
  ) VALUES (
    v_tenant_id, 'manual', p_plan_code, 'active',
    now(), now() + make_interval(days => p_days)
  );

  PERFORM app.refresh_entitlement_for_tenant(v_tenant_id);

  -- 6) Върни резултат
  RETURN json_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_code', p_tenant_code,
    'owner_email', p_owner_email,
    'owner_password', p_owner_password,  -- ЗА ИЗПРАЩАНЕ ПО EMAIL
    'message', 'Tenant and owner account created successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Предимства:**
- ✅ Едно извикване → готова компания + owner акаунт
- ✅ Няма ръчни стъпки
- ✅ Може да се генерира случайна парола и да се изпрати по email

---

### **Вариант 2: Invite System (По-сложен)**

```
1. Admin създава tenant (само компанията)
2. Admin изпраща "invite link" на owner-а
3. Owner кликва линка и си създава акаунт + парола
4. Автоматично се добавя membership към tenant-а
```

**Предимства:**
- ✅ Owner-ът си избира паролата
- ✅ По-сигурно (няма изпращане на пароли)

**Недостатъци:**
- ❌ По-сложна имплементация
- ❌ Трябва email service (Resend, SendGrid, etc.)

---

### **Вариант 3: Hybrid (Best of Both Worlds)**

```
1. Admin създава tenant + temporary owner account с генерирана парола
2. Автоматично се изпраща "reset password" линк на owner-а
3. Owner кликва и си задава своя парола
```

**Това е най-добрата комбинация!**

---

## 🚨 КРИТИЧНИ ПРОБЛЕМИ В МОМЕНТА

### 1. **Паролите се пазят в plain text в SQL скриптовете!**
```sql
-- ❌ ЛОШО - паролата е видима
encrypted_password: crypt('TestPassword123!', gen_salt('bf'))
```

**Решение:** Паролите да се генерират случайно или да се хеширват на backend-а.

---

### 2. **Няма email verification**
Потребителите могат да влязат веднага без да потвърдят email-а.

**Решение:** 
- Включи Supabase email confirmation
- Или използвай `email_confirmed_at = NULL` и изискай потвърждение

---

### 3. **Няма password recovery за multi-tenant setup**

Проблем: 
- Supabase auth не знае за tenant_id
- При reset password, потребителят може да влезе в грешен tenant

**Решение:**
- Добави tenant_id в JWT custom claims
- При login винаги проверявай дали user има membership в tenant-а

---

## 💡 ПРЕПОРЪКИ

### За Production:

1. **Използвай Вариант 1 (Auto-Registration)**
   - Автоматично създаване на owner account
   - Изпращане на welcome email с credentials
   - Форсирай password change при първи login

2. **Добави Email Service**
   - Resend.com (10,000 free emails/month)
   - Welcome email с login инструкции
   - Password reset emails

3. **Подобри Security**
   - Генерирай силни случайни пароли
   - Изискай password change след първи login
   - Добави 2FA (optional)

4. **Admin Panel подобрения**
   - Показвай owner email в tenant card
   - Бутон "Resend Welcome Email"
   - Бутон "Reset Password" (вече го има!)

---

## 📝 СЛЕДВАЩИ СТЪПКИ

1. ✅ Прегледай текущата логика (Done - този документ)
2. ⬜ Избери решение (Вариант 1, 2 или 3?)
3. ⬜ Имплементирай `admin_create_tenant_with_owner()`
4. ⬜ Обнови APP-ADMIN UI да използва новата функция
5. ⬜ Тествай с реални tenants
6. ⬜ Добави email service (optional но препоръчително)

---

**Какво предпочиташ?**
- A) Вариант 1 (Auto-create owner + генерирана парола)
- B) Вариант 2 (Invite system)
- C) Вариант 3 (Hybrid - auto + password reset link)

Кажи ми и ще започнем имплементацията! 🚀
