-- ================================================================
-- FIX: admin_get_all_tenants() — изрични типове, без амбигуитет
-- ================================================================
-- Причина за грешка: "structure of query does not match function result type"
--   → EXTRACT(...) връща double precision, ::int casting в CASE Expression
--     може да бъде нееднозначен в plpgsql при runtime type check.
-- Решение:
--   → (timestamptz::date - date) = integer (100% integer, без cast)
--   → Изрични ::text, ::uuid касти навсякъде
--   → DROP ... CASCADE преди CREATE
-- ================================================================

-- Премахване с CASCADE (изчиства всякакви зависимости)
DROP FUNCTION IF EXISTS public.admin_get_all_tenants() CASCADE;

CREATE FUNCTION public.admin_get_all_tenants()
RETURNS TABLE (
  id                  uuid,
  code                text,
  name                text,
  owner_email         text,
  plan_code           text,
  subscription_status text,
  current_period_end  timestamptz,
  entitlement_status  text,
  grace_until         timestamptz,
  read_only           boolean,
  days_remaining      integer,
  member_count        bigint,
  created_at          timestamptz,
  current_period_start timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, auth, public, pg_catalog
STABLE
AS $$
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    t.id::uuid,
    t.code::text,
    t.name::text,
    (
      SELECT u.email::text
      FROM app.memberships m
      JOIN auth.users u ON u.id = m.user_id
      WHERE m.tenant_id = t.id
        AND m.role = 'owner'
        AND m.is_active = true
      LIMIT 1
    )::text                                         AS owner_email,
    COALESCE(s.plan_code, 'monthly')::text          AS plan_code,
    COALESCE(s.status, 'expired')::text             AS subscription_status,
    s.current_period_end::timestamptz               AS current_period_end,
    COALESCE(e.status, 'expired')::text             AS entitlement_status,
    e.grace_until::timestamptz                      AS grace_until,
    COALESCE(e.read_only, true)::boolean            AS read_only,
    CASE
      WHEN s.current_period_end IS NOT NULL
        THEN (s.current_period_end::date - CURRENT_DATE)::integer
      ELSE (-999)::integer
    END                                             AS days_remaining,
    (
      SELECT COUNT(*)::bigint
      FROM app.memberships m2
      WHERE m2.tenant_id = t.id AND m2.is_active = true
    )::bigint                                       AS member_count,
    t.created_at::timestamptz,
    s.current_period_start::timestamptz             AS current_period_start
  FROM app.tenants t
  LEFT JOIN app.subscriptions s
         ON s.tenant_id = t.id AND s.provider = 'manual'
  LEFT JOIN app.entitlements e
         ON e.tenant_id = t.id
  ORDER BY t.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_tenants() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- Тест - трябва да върне редове ако вече съществуват tenants:
-- SELECT * FROM public.admin_get_all_tenants();
