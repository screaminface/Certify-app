import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { LogOut, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import TenantList from './TenantList'

interface DashboardProps {
  user: User
  onLogout: () => void
}

interface Tenant {
  id: string
  code: string
  name: string
  plan_code: string
  subscription_status: string
  current_period_end: string | null
  entitlement_status: string
  grace_until: string | null
  read_only: boolean
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadTenants = async () => {
    setRefreshing(true)
    try {
      const { data, error } = await supabase
        .rpc('admin_get_all_tenants')

      if (error) throw error

      const formatted = (data || []).map((t: any) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        plan_code: t.plan_code || 'monthly',
        subscription_status: t.subscription_status || 'expired',
        current_period_end: t.current_period_end || null,
        entitlement_status: t.entitlement_status || 'expired',
        grace_until: t.grace_until || null,
        read_only: t.read_only ?? true,
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

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.entitlement_status === 'active').length,
    grace: tenants.filter(t => t.entitlement_status === 'grace').length,
    expired: tenants.filter(t => t.entitlement_status === 'expired').length,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                CERTIFY Admin Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Logged in as {user.email}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={loadTenants}
                disabled={refreshing}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onLogout}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Total Tenants</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Active</div>
            <div className="text-3xl font-bold text-green-600 mt-2">{stats.active}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Grace Period</div>
            <div className="text-3xl font-bold text-yellow-600 mt-2">{stats.grace}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Expired</div>
            <div className="text-3xl font-bold text-red-600 mt-2">{stats.expired}</div>
          </div>
        </div>
      </div>

      {/* Tenant List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {loading ? (
          <div className="text-center py-12">
            <div className="text-lg text-gray-600">Loading tenants...</div>
          </div>
        ) : (
          <TenantList tenants={tenants} onRefresh={loadTenants} />
        )}
      </div>
    </div>
  )
}
