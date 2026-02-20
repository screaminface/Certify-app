import { supabase } from '../lib/supabase'

export function useAdminActions() {
  const extendSubscription = async (
    tenantId: string,
    plan: 'monthly' | 'yearly',
    days: number
  ) => {
    console.log('🔵 Extending subscription:', { tenantId, plan, days })
    const { data, error } = await supabase.rpc('manual_set_paid_until', {
      p_tenant_id: tenantId,
      p_plan_code: plan,
      p_days: days,
      p_note: `Admin extended ${days} days (${plan})`,
    })

    if (error) {
      console.error('❌ Extend error:', error)
      alert(`Failed to extend: ${error.message}`)
      throw error
    }
    console.log('✅ Extended successfully:', data)
    return data
  }

  const lockTenant = async (tenantId: string) => {
    console.log('🔴 Locking tenant:', tenantId)
    const { data, error } = await supabase.rpc('manual_mark_unpaid', {
      p_tenant_id: tenantId,
      p_new_status: 'expired',
      p_note: 'Admin locked tenant',
    })

    if (error) {
      console.error('❌ Lock error:', error)
      alert(`Failed to lock: ${error.message}`)
      throw error
    }

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

    console.log('✅ Locked successfully')
    return data
  }

  const ole.log('🟣 Switching plan:', { tenantId, newPlan })
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        plan_code: newPlan,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('provider', 'manual')
      .select()

    if (error) {
      console.error('❌ Switch plan error:', error)
      alert(`Failed to switch plan: ${error.message}`)
      throw error
    }

    // Refresh entitlement
    await supabase.rpc('refresh_entitlement_for_tenant', {
      p_tenant_id: tenantId,
    })

    console.log('✅ Switched plan successfully')    if (error) throw error

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
