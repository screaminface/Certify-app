import TenantCard from './TenantCard'

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

interface TenantListProps {
  tenants: Tenant[]
  onRefresh: () => void
}

export default function TenantList({ tenants, onRefresh }: TenantListProps) {
  if (tenants.length === 0) {
    return (
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg p-12 text-center border border-gray-100">
        <div className="text-6xl mb-4">📭</div>
        <p className="text-gray-500 font-medium">No tenants found</p>
        <p className="text-gray-400 text-sm mt-2">Add your first tenant to get started</p>
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
