import { CheckCircle, Clock, AlertTriangle, XCircle, Lock, List } from 'lucide-react'
import { getStatCardStyles } from '../lib/subscriptionUi'

export type FilterType = 'all' | 'active' | 'expiring' | 'grace' | 'expired' | 'locked'

interface StatsBarProps {
  totalCount: number
  activeCount: number
  expiringCount: number
  graceCount: number
  expiredCount: number
  lockedCount: number
  currentFilter: FilterType
  onFilterChange: (filter: FilterType) => void
}

export default function StatsBar({
  totalCount,
  activeCount,
  expiringCount,
  graceCount,
  expiredCount,
  lockedCount,
  currentFilter,
  onFilterChange
}: StatsBarProps) {
  const stats = [
    {
      id: 'all' as FilterType,
      label: 'Всички',
      value: totalCount,
      icon: List,
      color: 'text-slate-500'
    },
    {
      id: 'active' as FilterType,
      label: 'Активни',
      value: activeCount,
      icon: CheckCircle,
      color: 'text-emerald-500'
    },
    {
      id: 'expiring' as FilterType,
      label: 'Изтичащи',
      value: expiringCount,
      icon: Clock,
      color: 'text-amber-500'
    },
    {
      id: 'grace' as FilterType,
      label: 'Гратисен',
      value: graceCount,
      icon: AlertTriangle,
      color: 'text-orange-500'
    },
    {
      id: 'expired' as FilterType,
      label: 'Изтекли',
      value: expiredCount,
      icon: XCircle,
      color: 'text-red-500'
    },
    {
      id: 'locked' as FilterType,
      label: 'Заключени',
      value: lockedCount,
      icon: Lock,
      color: 'text-slate-500'
    }
  ]

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            const isActive = currentFilter === stat.id

            return (
              <button
                key={stat.id}
                onClick={() => onFilterChange(stat.id)}
                className={`
                  ${getStatCardStyles(isActive)}
                  p-4 rounded-xl transition-all duration-200
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  )}
                </div>
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-sm font-medium text-slate-600 mt-1">{stat.label}</div>
              </button>
            )
          })}
      </div>
    </div>
  )
}
