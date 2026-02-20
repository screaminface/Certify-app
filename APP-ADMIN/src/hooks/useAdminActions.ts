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

    // Refresh entitlement
    await supabase.rpc('refresh_entitlement_for_tenant', {
      p_tenant_id: tenantId,
    })

    console.log('✅ Locked successfully')
    return data
  }

  const unlockTenant = async (tenantId: string, plan: 'monthly' | 'yearly') => {
    // Unlock = extend by 30 days
    console.log('🟢 Unlocking tenant:', tenantId)
    return extendSubscription(tenantId, plan, 30)
  }

  const switchPlan = async (tenantId: string, newPlan: 'monthly' | 'yearly') => {
    console.log('🟣 Switching plan:', { tenantId, newPlan })
    
    // Use RPC instead of direct table access
    const { error: rpcError } = await supabase.rpc('admin_switch_plan', {
      p_tenant_id: tenantId,
      p_new_plan: newPlan,
    })

    if (rpcError) {
      console.error('❌ Switch plan error:', rpcError)
      alert(`Failed to switch plan: ${rpcError.message}`)
      throw  rpcError
    }

    console.log('✅ Switched plan successfully')
    return { success: true }
  }

  return {
    extendSubscription,
    lockTenant,
    unlockTenant,
    switchPlan,
  }
}
