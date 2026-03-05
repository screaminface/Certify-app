-- ================================================================
-- FIX: admin_delete_tenant() — изтрива и auth.users
-- ================================================================
-- Проблем: след изтриване на tenant, потребителят остава в auth.users
--   → JWT е все още валиден → потребителят остава "логнат"
-- Решение:
--   1. Преди DELETE — запазваме всички member user_id-та
--   2. DELETE tenant (CASCADE: memberships, subscriptions, entitlements)
--   3. За всеки user без останали memberships → изтрий auth.identities + auth.users
--   (Потребителят с memberships в ДРУГ tenant НЕ се изтрива)
-- ================================================================

DROP FUNCTION IF EXISTS public.admin_delete_tenant(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_tenant(
  p_tenant_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, auth, public, pg_catalog
AS $$
DECLARE
  v_tenant_name text;
  v_member_ids  uuid[];
  v_uid         uuid;
  v_deleted_users int := 0;
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_tenant_name
  FROM app.tenants
  WHERE id = p_tenant_id;

  IF v_tenant_name IS NULL THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
  END IF;

  -- 1) Запазваме member IDs преди да изтрием
  SELECT array_agg(DISTINCT m.user_id)
  INTO v_member_ids
  FROM app.memberships m
  WHERE m.tenant_id = p_tenant_id;

  -- 2) Изтриване на tenant (CASCADE: memberships, subscriptions, entitlements, billing_events)
  DELETE FROM app.tenants WHERE id = p_tenant_id;

  -- 3) За всеки бивш member: ако вече няма НИКАКЪВ tenant → изтрий от auth
  IF v_member_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY v_member_ids LOOP
      IF NOT EXISTS (
        SELECT 1 FROM app.memberships WHERE user_id = v_uid
      ) THEN
        DELETE FROM auth.identities WHERE user_id = v_uid;
        DELETE FROM auth.users      WHERE id       = v_uid;
        v_deleted_users := v_deleted_users + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'success',       true,
    'deleted_tenant', v_tenant_name,
    'deleted_users',  v_deleted_users
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_tenant(uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
