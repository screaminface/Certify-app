-- ==========================================
-- КОНФИГУРАЦИЯ: JWT Token с 1 минута валидност
-- ==========================================
-- Този файл конфигурира Supabase да издава JWT токени
-- с изключително кратка валидност (1 минута) за тестови цели.

-- ВНИМАНИЕ: Това е САМО ЗА ТЕСТВАНЕ!
-- Не използвайте в продукция - потребителите ще бъдат 
-- принудени да се логват на всяка минута!

-- ==========================================
-- Метод 1: Конфигурация през Supabase Dashboard
-- ==========================================
-- 1. Отидете на: https://app.supabase.com/project/[YOUR-PROJECT]/settings/auth
-- 2. Намерете "JWT Expiry" настройката
-- 3. Променете от 3600 (1 час) на 60 (1 минута)
-- 4. Запазете промените
-- 5. Потребителите трябва да излязат и да влязат отново

-- ==========================================
-- Метод 2: Конфигурация през SQL (за local dev)
-- ==========================================
-- За Supabase Local Development, можете да зададете в config.toml:
-- 
-- [auth]
-- jwt_expiry = 60  # 1 минута в секунди
-- 
-- След това рестартирайте Supabase:
-- supabase stop
-- supabase start

-- ==========================================
-- Метод 3: Environment Variable
-- ==========================================
-- Задайте в .env:
-- GOTRUE_JWT_EXPIRY=60

-- ==========================================
-- Тестване на JWT валидността
-- ==========================================

-- Функция за проверка на JWT token информация
create or replace function app.test_jwt_info()
returns table (
  user_id uuid,
  user_email text,
  token_issued_at timestamptz,
  token_expires_at timestamptz,
  seconds_until_expiry bigint,
  is_expired boolean
)
language plpgsql
security definer
as $$
declare
  jwt_exp bigint;
  jwt_iat bigint;
begin
  if auth.uid() is null then
    raise exception 'Не сте автентикиран';
  end if;

  -- Извличане на exp (expiration) и iat (issued at) от JWT
  jwt_exp := (auth.jwt() ->> 'exp')::bigint;
  jwt_iat := (auth.jwt() ->> 'iat')::bigint;

  return query
  select
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    to_timestamp(jwt_iat)::timestamptz,
    to_timestamp(jwt_exp)::timestamptz,
    jwt_exp - extract(epoch from now())::bigint,
    (jwt_exp - extract(epoch from now())::bigint) <= 0;
end;
$$;

grant execute on function app.test_jwt_info() to authenticated;

-- ==========================================
-- Тестване на автоматично обновяване на токен
-- ==========================================

create or replace function app.test_token_refresh_flow()
returns table (
  step_number int,
  step_name text,
  message text,
  success boolean
)
language plpgsql
security definer
as $$
declare
  initial_exp bigint;
  current_exp bigint;
  wait_seconds int := 65; -- Изчакваме малко повече от 1 минута
begin
  if auth.uid() is null then
    raise exception 'Не сте автентикиран';
  end if;

  -- Стъпка 1: Началeн JWT
  initial_exp := (auth.jwt() ->> 'exp')::bigint;
  
  return query select 
    1, 
    'Начален JWT токен'::text,
    'JWT изтича в: ' || to_timestamp(initial_exp)::text,
    true;

  return query select
    2,
    'Изчакване'::text,
    'Изчаква се ' || wait_seconds || ' секунди за изтичане на токена...',
    true;

  -- Изчакване
  perform pg_sleep(wait_seconds);

  -- Стъпка 3: Проверка след изчакване
  current_exp := (auth.jwt() ->> 'exp')::bigint;

  if current_exp = initial_exp then
    return query select
      3,
      'Проверка след изчакване'::text,
      '⚠️ JWT не е обновен автоматично. Клиентът трябва да рефрешне токена.',
      false;
  else
    return query select
      3,
      'Проверка след изчакване'::text,
      '✅ JWT е обновен успешно. Нов срок: ' || to_timestamp(current_exp)::text,
      true;
  end if;
end;
$$;

grant execute on function app.test_token_refresh_flow() to authenticated;

-- ==========================================
-- Тестване на просрочен JWT
-- ==========================================

create or replace function app.test_expired_jwt_behavior()
returns table (
  test_case text,
  expected_result text,
  actual_result text,
  passed boolean
)
language plpgsql
as $$
begin
  -- Тест 1: Проверка дали можем да извикаме функция с валиден JWT
  begin
    perform auth.uid();
    return query select
      'Валиден JWT'::text,
      'Функцията да се изпълни'::text,
      '✅ Функцията се изпълни успешно'::text,
      true;
  exception when others then
    return query select
      'Валиден JWT'::text,
      'Функцията да се изпълни'::text,
      '❌ Грешка: ' || sqlerrm,
      false;
  end;

  -- Тест 2: Проверка на JWT expiry
  declare
    jwt_exp bigint;
    time_left bigint;
  begin
    jwt_exp := (auth.jwt() ->> 'exp')::bigint;
    time_left := jwt_exp - extract(epoch from now())::bigint;

    if time_left <= 60 then
      return query select
        'JWT валидност'::text,
        'Не повече от 60 секунди'::text,
        '✅ JWT изтича след ' || time_left || ' сек',
        true;
    else
      return query select
        'JWT валидност'::text,
        'Не повече от 60 секунди'::text,
        '❌ JWT изтича след ' || time_left || ' сек (прекалено дълго)',
        false;
    end if;
  end;

  -- Информация
  return query select
    'Забележка'::text,
    'N/A'::text,
    'За да тествате просрочен JWT, изчакайте изтичането и опитайте да извикате функция.'::text,
    true;
end;
$$;

grant execute on function app.test_expired_jwt_behavior() to authenticated;

-- ==========================================
-- Инструкции за използване
-- ==========================================

select '╔══════════════════════════════════════════════════════════════════╗' as instruction union all
select '║         КОНФИГУРАЦИЯ НА JWT С 1 МИНУТА ВАЛИДНОСТ                ║' union all
select '╠══════════════════════════════════════════════════════════════════╣' union all
select '║                                                                  ║' union all
select '║  1. ЗАДАВАНЕ НА JWT EXPIRY:                                     ║' union all
select '║     • Supabase Dashboard -> Settings -> Auth                    ║' union all
select '║     • JWT Expiry: 60 (секунди)                                  ║' union all
select '║     • Или в config.toml: jwt_expiry = 60                        ║' union all
select '║                                                                  ║' union all
select '║  2. ИЗХОД И ВХОД:                                               ║' union all
select '║     След промяната потребителите трябва да излязат и влязат.   ║' union all
select '║                                                                  ║' union all
select '║  3. ПРОВЕРКА НА JWT ИНФОРМАЦИЯ:                                 ║' union all
select '║     SELECT * FROM app.test_jwt_info();                          ║' union all
select '║                                                                  ║' union all
select '║  4. ТЕСТ НА JWT ВАЛИДНОСТ:                                      ║' union all
select '║     SELECT * FROM app.test_expired_jwt_behavior();              ║' union all
select '║                                                                  ║' union all
select '║  5. КОМБИНИРАН ТЕСТ (JWT + Expiration):                         ║' union all
select '║     a) Променете JWT expiry на 60 сек                           ║' union all
select '║     b) Излезте и влезте отново                                  ║' union all
select '║     c) Изпълнете TEST_expiration_readonly.sql                   ║' union all
select '║     d) След 1 минута проверете статуса                          ║' union all
select '║                                                                  ║' union all
select '║  ВАЖНО: Не използвайте JWT = 60 сек в продукция!                ║' union all
select '║         Това е само за тестови цели.                            ║' union all
select '║                                                                  ║' union all
select '╚══════════════════════════════════════════════════════════════════╝';
