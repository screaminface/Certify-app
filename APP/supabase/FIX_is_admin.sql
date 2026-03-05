-- ================================================================
-- FIX: _is_admin() — по-надежден метод
-- ================================================================
-- Проблем: auth.jwt() ->> 'email' понякога е NULL (стар кеш, OAuth flow)
-- Решение: директна заявка към auth.users по auth.uid()
-- ================================================================

CREATE OR REPLACE FUNCTION public._is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id    = auth.uid()
      AND email = 'ventsi.vutov@gmail.com'
  );
$$;

NOTIFY pgrst, 'reload schema';

-- Тест (трябва да върне true ако си логнат):
-- SELECT public._is_admin();
