import TenantCard from './TenantCard'
import { type TenantData } from '../lib/subscriptionUi'
import { Inbox } from 'lucide-react'

interface TenantListProps {
  tenants: TenantData[]
  loading: boolean
  onRefresh: () => void
}

export default function TenantList({ tenants, loading, onRefresh }: TenantListProps) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
        <p className="text-gray-500 mt-4">Зарежда компании...</p>
      </div>
    )
  }

  if (tenants.length === 0) {
    return (
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-12 text-center border border-gray-100">
        <Inbox className="w-20 h-20 mx-auto mb-4 text-slate-300" />
        <p className="text-gray-500 font-medium">Няма намерени компании</p>
        <p className="text-gray-400 text-sm mt-2">Опитайте с различно търсене или филтър</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {tenants.map((tenant) => (
        <TenantCard key={tenant.id} tenant={tenant} onRefresh={onRefresh} />
      ))}
    </div>
  )
}
