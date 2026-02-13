-- SPI CERTIFY - Public RPC proxy for entitlement lookup
-- Purpose: allow client RPC call `entitlement_me` from public schema
-- while keeping actual logic in app.entitlement_me.

create or replace function public.entitlement_me(p_tenant_id uuid default null)
returns table (
  tenant_id uuid,
  plan_code text,
  status text,
  current_period_end timestamptz,
  grace_until timestamptz,
  read_only boolean,
  days_until_read_only integer
)
language sql
security definer
set search_path = public, app, auth
as $$
  select *
  from app.entitlement_me(p_tenant_id);
$$;

grant execute on function public.entitlement_me(uuid) to authenticated;
