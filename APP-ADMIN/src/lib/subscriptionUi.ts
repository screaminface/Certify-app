/**
 * Subscription UI helpers - compute statuses, days left, and Tailwind classes
 */

export const EXPIRING_SOON_DAYS = 7
export const GRACE_DAYS = 10

export type TenantStatus = 'active' | 'expiring_soon' | 'grace' | 'expired' | 'locked'

export interface TenantData {
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
  is_locked?: boolean
  days_remaining: number        // от backend (ADMIN_RPC_V2)
  member_count: number          // от backend (ADMIN_RPC_V2)
  created_at: string            // от backend (ADMIN_RPC_V2)
  current_period_start: string | null  // начало на абонамента
}

export interface ComputedStatus {
  status: TenantStatus
  daysLeft: number
  isActive: boolean
  isExpiring: boolean
  isGrace: boolean
  isExpired: boolean
  isLocked: boolean
  statusLabel: string
  statusColor: string
  borderColor: string
  badgeColor: string
  textColor: string
  displayText: string
  urgencyLevel: 'safe' | 'warning' | 'danger' | 'critical'
}

/**
 * Compute tenant status based on subscription data
 */
export function computeStatus(tenant: TenantData): ComputedStatus {
  const now = new Date()
  const periodEnd = tenant.current_period_end ? new Date(tenant.current_period_end) : null
  
  // Calculate days left
  const daysLeft = periodEnd 
    ? Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : -999

  // Check if locked
  const isLocked = tenant.is_locked || tenant.read_only

  // Determine status
  let status: TenantStatus
  let statusLabel: string
  let statusColor: string
  let borderColor: string
  let badgeColor: string
  let textColor: string
  let displayText: string
  let urgencyLevel: 'safe' | 'warning' | 'danger' | 'critical'

  // ── Единна палитра ──────────────────────────────────────────
  // Active    → emerald-500   Expiring → amber-500
  // Grace     → orange-500   Expired  → red-500
  // Locked    → slate-500    Primary  → indigo-600
  // ────────────────────────────────────────────────────────────

  if (isLocked) {
    status = 'locked'
    statusLabel = 'Locked'
    statusColor = 'bg-slate-100'
    borderColor = 'border-l-slate-500'
    badgeColor = 'bg-slate-200 text-slate-600'
    textColor = 'text-slate-600'
    displayText = 'Access blocked'
    urgencyLevel = 'critical'
  } else if (daysLeft < -GRACE_DAYS || tenant.entitlement_status === 'expired') {
    status = 'expired'
    statusLabel = 'Expired'
    statusColor = 'bg-red-50'
    borderColor = 'border-l-red-500'
    badgeColor = 'bg-red-100 text-red-600'
    textColor = 'text-red-600'
    displayText = `Expired ${Math.abs(daysLeft)} days ago`
    urgencyLevel = 'critical'
  } else if (daysLeft >= 0 && daysLeft <= GRACE_DAYS && tenant.entitlement_status === 'grace') {
    status = 'grace'
    statusLabel = 'Grace Period'
    statusColor = 'bg-orange-50'
    borderColor = 'border-l-orange-500'
    badgeColor = 'bg-orange-100 text-orange-600'
    textColor = 'text-orange-600'
    displayText = `Grace: ${daysLeft} days left`
    urgencyLevel = 'danger'
  } else if (daysLeft > 0 && daysLeft <= EXPIRING_SOON_DAYS) {
    status = 'expiring_soon'
    statusLabel = 'Expiring Soon'
    statusColor = 'bg-amber-50'
    borderColor = 'border-l-amber-500'
    badgeColor = 'bg-amber-100 text-amber-600'
    textColor = 'text-amber-600'
    displayText = `${daysLeft} days left`
    urgencyLevel = 'warning'
  } else {
    status = 'active'
    statusLabel = 'Active'
    statusColor = 'bg-emerald-50'
    borderColor = 'border-l-emerald-500'
    badgeColor = 'bg-emerald-100 text-emerald-600'
    textColor = 'text-emerald-600'
    displayText = `${daysLeft} days left`
    urgencyLevel = 'safe'
  }

  return {
    status,
    daysLeft,
    isActive: status === 'active',
    isExpiring: status === 'expiring_soon',
    isGrace: status === 'grace',
    isExpired: status === 'expired',
    isLocked: status === 'locked',
    statusLabel,
    statusColor,
    borderColor,
    badgeColor,
    textColor,
    displayText,
    urgencyLevel
  }
}

/**
 * Format plan name (text only, icons added in components)
 */
export function formatPlan(planCode: string): string {
  const plans: Record<string, string> = {
    monthly: 'Monthly',
    yearly: 'Yearly'
  }
  return plans[planCode] || planCode
}

/**
 * Get action button styles based on variant
 */
export function getButtonStyles(variant: 'primary' | 'warning' | 'danger' | 'secondary' | 'ghost') {
  const base = 'px-4 py-2 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'
  
  const variants = {
    primary:   'bg-indigo-600  hover:bg-indigo-700  text-white shadow-sm hover:shadow-md active:scale-95',
    warning:   'bg-amber-500   hover:bg-amber-600   text-white shadow-sm hover:shadow-md active:scale-95',
    danger:    'bg-red-500     hover:bg-red-600     text-white shadow-sm hover:shadow-md active:scale-95',
    secondary: 'bg-slate-100   hover:bg-slate-200   text-slate-600 active:scale-95',
    ghost:     'text-slate-500 hover:bg-slate-100 active:scale-95'
  }
  
  return `${base} ${variants[variant]}`
}

/**
 * Get stat card styles
 */
export function getStatCardStyles(active: boolean) {
  return active 
    ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md scale-105'
    : 'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-pointer'
}
