import { supabase } from '../lib/supabase'

export function useAdminActions() {
  const extendSubscription = async (
    tenantId: string,
    plan: 'monthly' | 'yearly',
    days: number
  ) => {
    const { data, error } = await supabase.rpc('manual_set_paid_until', {
      p_tenant_id: tenantId,
      p_plan_code: plan,
      p_days: days,
      p_note: `Admin extended ${days} days (${plan})`,
    })

    if (error) throw error
    return data
  }

  const lockTenant = async (tenantId: string) => {
    const { data, error } = await supabase.rpc('manual_mark_unpaid', {
      p_tenant_id: tenantId,
      p_new_status: 'expired',
      p_note: 'Admin locked tenant',
    })

    if (error) throw error

    // Also set period to past to ensure immediate lock
    await supabase
      .from('subscriptions')
      .update({
        status: 'expired',
        current_period_end: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('provider', 'manual')

    // Refresh entitlement
    await supabase.rpc('refresh_entitlement_for_tenant', {
      p_tenant_id: tenantId,
    })

    return data
  }

  const unlockTenant = async (tenantId: string, plan: 'monthly' | 'yearly') => {
    // Unlock = extend by 30 days
    return extendSubscription(tenantId, plan, 30)
  }

  const switchPlan = async (tenantId: string, newPlan: 'monthly' | 'yearly') => {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        plan_code: newPlan,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('provider', 'manual')
      .select()

    if (error) throw error

    // Refresh entitlement
    await supabase.rpc('refresh_entitlement_for_tenant', {
      p_tenant_id: tenantId,
    })

    return data
  }

  return {
    extendSubscription,
    lockTenant,
    unlockTenant,
    switchPlan,
  }
}
