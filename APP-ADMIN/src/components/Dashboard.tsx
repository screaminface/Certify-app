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
  owner_email: string | null
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
      console.log('🔍 Calling admin_get_all_tenants...')
      const { data, error } = await supabase
        .rpc('admin_get_all_tenants')

      console.log('📦 RPC Response:', { data, error })

      if (error) {
        console.error('❌ RPC Error:', error)
        throw error
      }

      const formatted = (data || []).map((t: any) => ({
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
      }))

      console.log('✅ Formatted tenants:', formatted)
      setTenants(formatted)
    } catch (error) {
      console.error('💥 Error loading tenants:', error)
      alert('Failed to load tenants. Check console for details.')
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                CERTIFY Admin
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                👤 {user.email}
              </p>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={loadTenants}
                disabled={refreshing}
                className="p-2.5 text-gray-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50 hover:scale-105 active:scale-95"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
              </button>
              <button
                onClick={onLogout}
                className="flex items-center space-x-2 px-4 sm:px-5 py-2.5 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all hover:scale-105 active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg hover:shadow-xl transition-all p-4 sm:p-6 border border-gray-100 hover:scale-105">
            <div className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wide">Total</div>
            <div className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-gray-700 to-gray-900 bg-clip-text text-transparent mt-2">{stats.total}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl shadow-lg hover:shadow-xl transition-all p-4 sm:p-6 border border-green-200 hover:scale-105">
            <div className="text-xs sm:text-sm font-medium text-green-700 uppercase tracking-wide">Active</div>
            <div className="text-2xl sm:text-3xl font-black text-green-600 mt-2">{stats.active}</div>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-amber-100 rounded-2xl shadow-lg hover:shadow-xl transition-all p-4 sm:p-6 border border-yellow-200 hover:scale-105">
            <div className="text-xs sm:text-sm font-medium text-yellow-700 uppercase tracking-wide">Grace</div>
            <div className="text-2xl sm:text-3xl font-black text-yellow-600 mt-2">{stats.grace}</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-pink-100 rounded-2xl shadow-lg hover:shadow-xl transition-all p-4 sm:p-6 border border-red-200 hover:scale-105">
            <div className="text-xs sm:text-sm font-medium text-red-700 uppercase tracking-wide">Expired</div>
            <div className="text-2xl sm:text-3xl font-black text-red-600 mt-2">{stats.expired}</div>
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
