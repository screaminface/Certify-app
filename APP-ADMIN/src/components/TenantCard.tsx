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
    // TODO: Implement password reset email trigger
    alert('Password reset feature coming soon')
  }

  const statusConfig = {
    active: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', label: 'Active' },
    grace: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Grace' },
    expired: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Expired' },
  }

  const status = statusConfig[tenant.entitlement_status as keyof typeof statusConfig] || statusConfig.expired
  const StatusIcon = status.icon

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-bold text-gray-900">{tenant.name}</h3>
            <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
              <StatusIcon className="w-3 h-3" />
              <span>{status.label}</span>
            </span>
          </div>
          <p className="text-sm text-gray-500">{tenant.code}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-gray-700 capitalize">
            {tenant.plan_code}
          </div>
          {tenant.current_period_end && (
            <div className="text-xs text-gray-500 mt-1">
              Expires {formatDistanceToNow(new Date(tenant.current_period_end), { addSuffix: true })}
            </div>
          )}
        </div>
      </div>

      {tenant.entitlement_status === 'grace' && tenant.grace_until && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start space-x-2">
          <Clock className="w-4 h-4 text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <span className="font-medium">Grace period:</span> {formatDistanceToNow(new Date(tenant.grace_until), { addSuffix: true })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleExtend(30, 'monthly')}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-gray-300 transition"
        >
          <Calendar className="w-4 h-4" />
          <span>+30d</span>
        </button>

        <button
          onClick={() => handleExtend(365, 'yearly')}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:bg-gray-300 transition"
        >
          <Calendar className="w-4 h-4" />
          <span>+365d</span>
        </button>

        {tenant.read_only ? (
          <button
            onClick={handleUnlock}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:bg-gray-300 transition"
          >
            <Unlock className="w-4 h-4" />
            <span>Unlock</span>
          </button>
        ) : (
          <button
            onClick={handleLock}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:bg-gray-300 transition"
          >
            <Lock className="w-4 h-4" />
            <span>Lock</span>
          </button>
        )}

        <button
          onClick={handleSwitchPlan}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 disabled:bg-gray-300 transition"
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>{tenant.plan_code === 'monthly' ? 'To Yearly' : 'To Monthly'}</span>
        </button>

        <button
          onClick={handleResetPassword}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-2 bg-gray-600 text-white text-sm font-medium rounded hover:bg-gray-700 disabled:bg-gray-300 transition"
        >
          <Mail className="w-4 h-4" />
          <span>Reset Pass</span>
        </button>
      </div>
    </div>
  )
}
