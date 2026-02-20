import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  Calendar, 
  Lock, 
  Unlock, 
  Mail, 
  ArrowLeftRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'
import { useAdminActions } from '../hooks/useAdminActions'
import { supabase } from '../lib/supabase'

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

interface TenantCardProps {
  tenant: Tenant
  onRefresh: () => void
}

export default function TenantCard({ tenant, onRefresh }: TenantCardProps) {
  const [loading, setLoading] = useState(false)
  const { extendSubscription, lockTenant, unlockTenant, switchPlan } = useAdminActions()

  const handleExtend = async (days: number, plan: 'monthly' | 'yearly') => {
    setLoading(true)
    try {
      await extendSubscription(tenant.id, plan, days)
      await onRefresh()
    } catch (error) {
      console.error('Failed to extend:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLock = async () => {
    setLoading(true)
    try {
      await lockTenant(tenant.id)
      await onRefresh()
    } catch (error) {
      console.error('Failed to lock:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUnlock = async () => {
    setLoading(true)
    try {
      await unlockTenant(tenant.id, tenant.plan_code as 'monthly' | 'yearly')
      await onRefresh()
    } catch (error) {
      console.error('Failed to unlock:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchPlan = async () => {
    setLoading(true)
    try {
      const newPlan = tenant.plan_code === 'monthly' ? 'yearly' : 'monthly'
      await switchPlan(tenant.id, newPlan)
      await onRefresh()
    } catch (error) {
      console.error('Failed to switch plan:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!tenant.owner_email) {
      alert('No owner email found for this tenant')
      return
    }
    
    setLoading(true)
    try {
      // Send reset link to main CERTIFY app
      const { error } = await supabase.auth.resetPasswordForEmail(tenant.owner_email, {
        redirectTo: 'http://localhost:5173'
      })
      
      if (error) throw error
      
      alert(`✅ Password reset email sent to ${tenant.owner_email}\n\nThey will reset password in the main CERTIFY app.`)
    } catch (error) {
      console.error('Failed to send reset email:', error)
      alert('❌ Failed to send password reset email')
    } finally {
      setLoading(false)
    }
  }

  const statusConfig = {
    active: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', label: 'Active' },
    grace: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Grace' },
    expired: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Expired' },
  }

  const status = statusConfig[tenant.entitlement_status as keyof typeof statusConfig] || statusConfig.expired
  const StatusIcon = status.icon

  return (
    <div className="bg-gradient-to-br from-white to-gray-50/50 rounded-2xl shadow-lg hover:shadow-2xl transition-all p-5 sm:p-6 border border-gray-100 hover:scale-[1.02]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="text-lg sm:text-xl font-black text-gray-900">{tenant.name}</h3>
            <span className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-bold ${status.bg} ${status.color} shadow-sm`}>
              <StatusIcon className="w-3.5 h-3.5" />
              <span>{status.label}</span>
            </span>
            <span className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm">
              {tenant.plan_code === 'yearly' ? '📅 Yearly' : '📆 Monthly'}
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mb-2">{tenant.code}</p>
          {tenant.current_period_end && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="font-bold text-gray-700">💳 Paid until:</span>
              <span className="text-gray-900 font-semibold">
                {new Date(tenant.current_period_end).toLocaleDateString('bg-BG', { 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>
              <span className="text-xs text-gray-400">({formatDistanceToNow(new Date(tenant.current_period_end), { addSuffix: true })})</span>
            </div>
          )}
        </div>
      </div>

      {tenant.entitlement_status === 'grace' && tenant.grace_until && (
        <div className="mb-4 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-xl flex items-start space-x-3 shadow-sm">
          <Clock className="w-5 h-5 text-yellow-600 mt-0.5 animate-pulse" />
          <div className="text-sm text-yellow-800">
            <span className="font-bold">⚠️ Grace period:</span> {formatDistanceToNow(new Date(tenant.grace_until), { addSuffix: true })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {tenant.entitlement_status === 'active' ? (
          <button
            onClick={() => handleExtend(30, 'monthly')}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:shadow-lg disabled:from-gray-300 disabled:to-gray-400 transition-all hover:scale-105 active:scale-95"
          >
            <Calendar className="w-4 h-4" />
            <span>+30d</span>
          </button>
        ) : (
          <button
            onClick={handleUnlock}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:shadow-lg disabled:from-gray-300 disabled:to-gray-400 transition-all hover:scale-105 active:scale-95"
          >
            <Unlock className="w-4 h-4" />
            <span>Unlock</span>
          </button>
        )}

        <button
          onClick={() => handleExtend(365, 'yearly')}
          disabled={loading}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold rounded-xl hover:shadow-lg disabled:from-gray-300 disabled:to-gray-400 transition-all hover:scale-105 active:scale-95"
        >
          <Calendar className="w-4 h-4" />
          <span>+365d</span>
        </button>

        {tenant.entitlement_status === 'active' ? (
          <button
            onClick={handleLock}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-gradient-to-r from-red-500 to-pink-600 text-white text-sm font-bold rounded-xl hover:shadow-lg disabled:from-gray-300 disabled:to-gray-400 transition-all hover:scale-105 active:scale-95"
          >
            <Lock className="w-4 h-4" />
            <span>Lock</span>
          </button>
        ) : null}

        <button
          onClick={handleSwitchPlan}
          disabled={loading}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white text-sm font-bold rounded-xl hover:shadow-lg disabled:from-gray-300 disabled:to-gray-400 transition-all hover:scale-105 active:scale-95"
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span className="hidden sm:inline">{tenant.plan_code === 'monthly' ? 'To Yearly' : 'To Monthly'}</span>
          <span className="sm:hidden">Switch</span>
        </button>

        <button
          onClick={handleResetPassword}
          disabled={loading}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white text-sm font-bold rounded-xl hover:shadow-lg disabled:from-gray-300 disabled:to-gray-400 transition-all hover:scale-105 active:scale-95"
        >
          <Mail className="w-4 h-4" />
          <span className="hidden sm:inline">Reset Pass</span>
          <span className="sm:hidden">Reset</span>
        </button>
      </div>
    </div>
  )
}
