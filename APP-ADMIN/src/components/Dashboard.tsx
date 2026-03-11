import { useState, useEffect, useMemo } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import AdminHeader from './AdminHeader'
import StatsBar, { type FilterType } from './StatsBar'
import TenantList from './TenantList'
import CreateTenantModal from './CreateTenantModal'
import { computeStatus, type TenantData } from '../lib/subscriptionUi'

interface DashboardProps {
  user: User
  onLogout: () => void
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [tenants, setTenants] = useState<TenantData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentFilter, setCurrentFilter] = useState<FilterType>('all')

  const loadTenants = async () => {
    if (refreshing) return // Prevent multiple simultaneous refreshes
    
    setRefreshing(true)
    try {
      const { data, error } = await supabase.rpc('admin_get_all_tenants')

      if (error) {
        console.error('RPC Error:', error)
        alert(`Backend error: ${error.message}`)
        throw error
      }

      const formatted: TenantData[] = (data || []).map((t: any) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        owner_email: t.owner_email || null,
        plan_code: t.plan_code || 'monthly',
        subscription_status: t.subscription_status || 'expired',
        current_period_end: t.current_period_end || null,
        entitlement_status: t.entitlement_status || 'expired',
        grace_until: t.grace_until || null,
        read_only: t.read_only ?? true,
        is_locked: false,
        days_remaining: t.days_remaining ?? -999,
        member_count: t.member_count ?? 0,
        created_at: t.created_at || new Date().toISOString(),
        current_period_start: t.current_period_start || null,
      }))

      setTenants(formatted)
    } catch (error) {
      console.error('Error loading tenants:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadTenants()
  }, [])

  // Compute stats with computed status
  const stats = useMemo(() => {
    const computedTenants = tenants.map(t => ({ tenant: t, computed: computeStatus(t) }))
    
    return {
      total: tenants.length,
      active: computedTenants.filter(({ computed }) => computed.isActive).length,
      expiring: computedTenants.filter(({ computed }) => computed.isExpiring).length,
      grace: computedTenants.filter(({ computed }) => computed.isGrace).length,
      expired: computedTenants.filter(({ computed }) => computed.isExpired).length,
      locked: computedTenants.filter(({ computed }) => computed.isLocked).length
    }
  }, [tenants])

  // Filter and search tenants
  const filteredTenants = useMemo(() => {
    let filtered = tenants

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(query) ||
        t.code.toLowerCase().includes(query) ||
        (t.owner_email && t.owner_email.toLowerCase().includes(query))
      )
    }

    // Apply status filter
    if (currentFilter !== 'all') {
      filtered = filtered.filter(t => {
        const computed = computeStatus(t)
        switch (currentFilter) {
          case 'active': return computed.isActive
          case 'expiring': return computed.isExpiring
          case 'grace': return computed.isGrace
          case 'expired': return computed.isExpired
          case 'locked': return computed.isLocked
          default: return true
        }
      })
    }

    return filtered
  }, [tenants, searchQuery, currentFilter])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100">
      <AdminHeader
        userEmail={user.email || 'admin'}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddTenant={() => setShowCreateModal(true)}
        onRefresh={loadTenants}
        onLogout={onLogout}
        refreshing={refreshing}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-28">
        <StatsBar
          totalCount={stats.total}
          activeCount={stats.active}
          expiringCount={stats.expiring}
          graceCount={stats.grace}
          expiredCount={stats.expired}
          lockedCount={stats.locked}
          currentFilter={currentFilter}
          onFilterChange={setCurrentFilter}
        />

        <div className="mt-4">
          <TenantList
            tenants={filteredTenants}
            loading={loading}
            onRefresh={loadTenants}
          />
        </div>
      </main>

      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            loadTenants()
          }}
        />
      )}
    </div>
  )
}
