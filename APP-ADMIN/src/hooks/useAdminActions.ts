import { supabase } from '../lib/supabase'

export function useAdminActions() {

  // ── Удължи абонамент ─────────────────────────────────────────────
  const extendSubscription = async (
    tenantId: string,
    plan: 'monthly' | 'yearly',
    days: number
  ) => {
    const { data, error } = await supabase.rpc('admin_extend_subscription', {
      p_tenant_id: tenantId,
      p_plan_code: plan,
      p_days: days,
      p_note: `Admin extended ${days}d (${plan})`,
    })
    if (error) throw error
    return data
  }

  // ── Заключи (expire веднага) ─────────────────────────────────────
  const lockTenant = async (tenantId: string) => {
    const { data, error } = await supabase.rpc('admin_lock_tenant', {
      p_tenant_id: tenantId,
      p_note: 'Admin locked tenant',
    })
    if (error) throw error
    return data
  }

  // ── Отключи (удължи с 30 дни) ───────────────────────────────────
  const unlockTenant = async (tenantId: string, plan: 'monthly' | 'yearly') => {
    return extendSubscription(tenantId, plan, 30)
  }

  // ── Смени план ──────────────────────────────────────────────────
  const switchPlan = async (tenantId: string, newPlan: 'monthly' | 'yearly') => {
    const { data, error } = await supabase.rpc('admin_switch_plan', {
      p_tenant_id: tenantId,
      p_new_plan: newPlan,
    })
    if (error) throw error
    return data
  }

  // ── Пусни гратисен период (10 дни по подразбиране) ─────────────
  const setGrace = async (tenantId: string, days: number = 10) => {
    const { data, error } = await supabase.rpc('admin_set_grace', {
      p_tenant_id: tenantId,
      p_days: days,
    })
    if (error) throw error
    return data
  }

  // ── Изтрий tenant (CASCADE) ─────────────────────────────────────
  const deleteTenant = async (tenantId: string) => {
    const { data, error } = await supabase.rpc('admin_delete_tenant', {
      p_tenant_id: tenantId,
    })
    if (error) throw error
    const result = data as { success: boolean; deleted_tenant?: string; error?: string }
    if (!result?.success) throw new Error(result?.error || 'Delete failed')
    return result
  }

  // ── Свържи съществуващ потребител към tenant по email ─────────────
  const linkUserToTenant = async (tenantId: string, email: string) => {
    const { data, error } = await supabase.rpc('admin_link_user_to_tenant', {
      p_tenant_id: tenantId,
      p_email: email,
    })
    if (error) throw error
    const result = data as { success: boolean; message?: string; error?: string }
    if (!result?.success) throw new Error(result?.error || 'Link failed')
    return result
  }

  // ── Създай нов auth потребител и го свържи към tenant ───────────────
  // (без service role key — работи чрез SQL SECURITY DEFINER функция)
  const createAndLinkUser = async (tenantId: string, email: string, password: string) => {
    // 1. Създай auth потребител (или продължи ако съществува)
    const { data: createData, error: createError } = await supabase.rpc('admin_create_user', {
      p_email: email,
      p_password: password,
    })
    if (createError) throw createError
    const createResult = createData as { success: boolean; message?: string; error?: string }
    if (!createResult?.success) throw new Error(createResult?.error || 'Create user failed')

    // 2. Свържи към tenant
    return linkUserToTenant(tenantId, email)
  }

  return {
    extendSubscription,
    lockTenant,
    unlockTenant,
    setGrace,
    switchPlan,
    deleteTenant,
    linkUserToTenant,
    createAndLinkUser,
  }
}
