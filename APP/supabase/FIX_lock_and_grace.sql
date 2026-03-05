-- ================================================================
-- FIX: admin_lock_tenant — истинско заключване (bypass grace period)
-- NEW: admin_set_grace — ръчно пускане на гратисен период
-- ================================================================

-- ── 1. FIX admin_lock_tenant ──────────────────────────────────────
-- Проблем: refresh_entitlement изчислява grace = period_end + 10 дни
--          → след "Заключи" влиза в grace вместо да блокира
-- Решение: след refresh директно UPDATE entitlement → status='revoked', read_only=true
DROP FUNCTION IF EXISTS public.admin_lock_tenant(uuid, text);

CREATE FUNCTION public.admin_lock_tenant(
  p_tenant_id uuid,
  p_note      text DEFAULT 'Admin locked'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  -- Маркирай абонамента като изтекъл (далеч в миналото → без grace)
  UPDATE app.subscriptions
  SET
    status             = 'expired',
    current_period_end = now() - interval '30 days',  -- достатъчно в миналото
    canceled_at        = now(),
    updated_at         = now()
  WHERE tenant_id = p_tenant_id AND provider = 'manual';

  -- Refresh ще изчисли grace_until = (now()-30d) + 10d = now()-20d → вече изтекъл
  PERFORM app.refresh_entitlement_for_tenant(p_tenant_id);

  -- Директен override на entitlement → сигурно заключен без grace
  UPDATE app.entitlements
  SET
    status      = 'revoked',
    read_only   = true,
    grace_until = null,
    updated_at  = now()
  WHERE tenant_id = p_tenant_id;

  RETURN json_build_object('success', true, 'status', 'revoked');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_lock_tenant(uuid, text) TO authenticated, anon;


-- ── 2. NEW admin_set_grace ────────────────────────────────────────
-- Пуска гратисен период от СЕГА за 10 дни (потребителят може да ползва read-only)
CREATE OR REPLACE FUNCTION public.admin_set_grace(
  p_tenant_id uuid,
  p_days      integer DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF NOT public._is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  -- current_period_end = now() → grace_until = now() + p_days дни
  UPDATE app.subscriptions
  SET
    status             = 'expired',
    current_period_end = now(),
    canceled_at        = now(),
    updated_at         = now()
  WHERE tenant_id = p_tenant_id AND provider = 'manual';

  -- refresh ще изчисли grace_until = now() + 10 дни → status='grace', read_only=false
  PERFORM app.refresh_entitlement_for_tenant(p_tenant_id);

  -- Ако искаме custom брой дни (различен от 10), override grace_until директно
  IF p_days != 10 THEN
    UPDATE app.entitlements
    SET
      grace_until = now() + make_interval(days => p_days),
      updated_at  = now()
    WHERE tenant_id = p_tenant_id;
  END IF;

  RETURN json_build_object('success', true, 'grace_days', p_days, 'status', 'grace');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_grace(uuid, integer) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
