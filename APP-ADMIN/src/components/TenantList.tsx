import TenantCard from './TenantCard'

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

interface TenantListProps {
  tenants: Tenant[]
  onRefresh: () => void
}

export default function TenantList({ tenants, onRefresh }: TenantListProps) {
  if (tenants.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-500">No tenants found</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {tenants.map((tenant) => (
        <TenantCard key={tenant.id} tenant={tenant} onRefresh={onRefresh} />
      ))}
    </div>
  )
}
