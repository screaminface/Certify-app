import { useState } from 'react'
import { format } from 'date-fns'
import {
  Calendar,
  CalendarCheck,
  Lock,
  Unlock,
  Mail,
  ArrowLeftRight,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  MoreVertical,
  Users,
  CalendarDays,
  Plus,
  Zap,
  Trash2,
  Hourglass,
} from 'lucide-react'
import { useAdminActions } from '../hooks/useAdminActions'
import { supabase } from '../lib/supabase'
import { computeStatus, formatPlan, type TenantData } from '../lib/subscriptionUi'

interface TenantCardProps {
  tenant: TenantData
  onRefresh: () => void
}

export default function TenantCard({ tenant, onRefresh }: TenantCardProps) {
  const [loading, setLoading] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const { extendSubscription, lockTenant, unlockTenant, setGrace, switchPlan, deleteTenant, createAndLinkUser } = useAdminActions()

  const computed = computeStatus(tenant)

  const StatusIcon =
    computed.isActive   ? CheckCircle :
    computed.isExpiring ? Clock :
    computed.isGrace    ? AlertTriangle :
    computed.isLocked   ? Lock :
    XCircle

  const PlanIcon = tenant.plan_code === 'yearly' ? CalendarCheck : Calendar

  // ── Helpers ──────────────────────────────────────────────────────────
  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true)
    setShowMore(false)
    try {
      await fn()
      await onRefresh()
    } catch (err: any) {
      alert(err?.message || 'Грешка — виж конзолата')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleExtend = (days: number) =>
    withLoading(() => extendSubscription(tenant.id, tenant.plan_code as 'monthly' | 'yearly', days))

  const handleLock = () =>
    withLoading(async () => {
      if (!confirm(`Заключи "${tenant.name}" ВЕДНАГА?\n\nДостъпът се блокира моментално — без гратисен период.`)) return
      await lockTenant(tenant.id)
    })

  const handleUnlock = () =>
    withLoading(() => unlockTenant(tenant.id, tenant.plan_code as 'monthly' | 'yearly'))

  const handleGrace = () =>
    withLoading(async () => {
      if (!confirm(`Пусни гратисен период за "${tenant.name}"?\n\n10 дни четене без плащане.`)) return
      await setGrace(tenant.id, 10)
    })

  const handleSwitchPlan = () =>
    withLoading(async () => {
      const newPlan = tenant.plan_code === 'monthly' ? 'yearly' : 'monthly'
      if (!confirm(`Смени план на "${tenant.name}" → ${newPlan === 'yearly' ? 'Годишен' : 'Месечен'}?`)) return
      await switchPlan(tenant.id, newPlan)
    })

  const handleDelete = () =>
    withLoading(async () => {
      const confirmed = prompt(`Изтрий "${tenant.name}" ЗАВИНАГИ?\n\nВъведи кода на компанията:`)
      if (confirmed !== tenant.code) { alert('Кодът не съвпада — отменено.'); return }
      await deleteTenant(tenant.id)
    })

  const handleResetPassword = () =>
    withLoading(async () => {
      if (!tenant.owner_email) { alert('Няма имейл на собственика'); return }
      const { error } = await supabase.auth.resetPasswordForEmail(tenant.owner_email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      alert(`Линкът е изпратен на ${tenant.owner_email}`)
    })

  const handleLinkUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkEmail.trim() || !linkPassword.trim()) return
    await withLoading(async () => {
      const result = await createAndLinkUser(tenant.id, linkEmail.trim(), linkPassword.trim())
      alert(result.message || `Потребителят е създаден и свързан!\n\nИмейл: ${linkEmail.trim()}`)
      setShowLinkForm(false)
      setLinkEmail('')
      setLinkPassword('')
    })
  }

  // ── Days remaining chip ───────────────────────────────────────────────
  const DaysChip = () => {
    const d = tenant.days_remaining
    if (computed.isLocked)
      return <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3" />Заключен</span>
    if (d === -999 || d == null)
      return <span className="text-xs font-bold text-red-500">Без абонамент</span>
    if (d <= 0 && computed.isGrace) {
      const gl = tenant.grace_until ? Math.ceil((new Date(tenant.grace_until).getTime() - Date.now()) / 86400000) : 0
      return <span className="text-xs font-bold text-orange-600">Grace: {gl > 0 ? `${gl} дни` : 'изтекъл'}</span>
    }
    if (d <= 0) return <span className="text-xs font-bold text-red-600">Изтекъл</span>
    const cls = d <= 7 ? 'text-red-600' : d <= 14 ? 'text-orange-600' : d <= 30 ? 'text-amber-600' : 'text-emerald-600'
    return <span className={`text-xs font-bold tabular-nums ${cls}`}>{d} {d === 1 ? 'ден' : 'дни'}</span>
  }

  const ringClass =
    computed.urgencyLevel === 'critical' ? 'ring-1 ring-red-200' :
    computed.urgencyLevel === 'danger'   ? 'ring-1 ring-orange-200' :
    computed.urgencyLevel === 'warning'  ? 'ring-1 ring-amber-200' : ''

  return (
    <div className={`relative bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4 ${computed.borderColor} ${ringClass}`}>
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center z-10 backdrop-blur-sm">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="p-5">
        {/* ── Row 1: Header ──────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-base font-bold text-slate-900 leading-tight">{tenant.name}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${computed.badgeColor}`}>
                <StatusIcon className="w-3 h-3" />
                {computed.statusLabel}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">
                <PlanIcon className="w-3 h-3" />
                {formatPlan(tenant.plan_code)}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400">{tenant.code}</p>
            {tenant.owner_email ? (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{tenant.owner_email}</span>
              </p>
            ) : (
              <div className="mt-0.5">
                {!showLinkForm ? (
                  <button
                    onClick={() => setShowLinkForm(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 hover:underline"
                  >
                    <Mail className="w-3 h-3" />
                    Няма потребител — свържи
                  </button>
                ) : (
                  <form onSubmit={handleLinkUser} className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="email"
                        value={linkEmail}
                        onChange={e => setLinkEmail(e.target.value)}
                        placeholder="email@firma.com"
                        required
                        autoFocus
                        className="flex-1 px-2 py-1 text-xs rounded-lg border border-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => { setShowLinkForm(false); setLinkEmail(''); setLinkPassword('') }}
                        className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                      >✕</button>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="password"
                        value={linkPassword}
                        onChange={e => setLinkPassword(e.target.value)}
                        placeholder="парола (мин. 6 символа)"
                        required
                        minLength={6}
                        className="flex-1 px-2 py-1 text-xs rounded-lg border border-indigo-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                      <button
                        type="submit"
                        disabled={loading || !linkEmail || !linkPassword}
                        className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                      >Създай</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* ⋮ More menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowMore(!showMore)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMore && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMore(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-slate-200 py-1 min-w-[190px]">
                  {tenant.owner_email && (
                    <button
                      onClick={handleResetPassword}
                      disabled={loading}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Mail className="w-4 h-4 text-indigo-500" />
                      Изпрати нова парола
                    </button>
                  )}
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Изтрий компанията
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Row 2: Stats strip ─────────────────────────────── */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <DaysChip />
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600">
              {tenant.member_count ?? 0} {(tenant.member_count ?? 0) === 1 ? 'потребител' : 'потребители'}
            </span>
          </div>
          {tenant.current_period_end && (
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-400">
                {tenant.current_period_start
                  ? `${format(new Date(tenant.current_period_start), 'dd.MM.yyyy')} \u2013 ${format(new Date(tenant.current_period_end), 'dd.MM.yyyy')}`
                  : `до ${format(new Date(tenant.current_period_end), 'dd.MM.yyyy')}`
                }
              </span>
            </div>
          )}
        </div>

        {/* ── Row 3: Actions ─────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={() => handleExtend(30)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:scale-95
                       transition-all disabled:opacity-50 border border-indigo-200"
          >
            <Plus className="w-3.5 h-3.5" />+30 дни
          </button>

          <button
            onClick={() => handleExtend(365)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:scale-95
                       transition-all disabled:opacity-50 border border-indigo-200"
          >
            <Zap className="w-3.5 h-3.5" />+1 година
          </button>

          <button
            onClick={handleSwitchPlan}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       bg-slate-50 text-slate-600 hover:bg-slate-100 active:scale-95
                       transition-all disabled:opacity-50 border border-slate-200"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            → {tenant.plan_code === 'monthly' ? 'Годишен' : 'Месечен'}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            {/* Активирай — при expired/locked/grace */}
            {(computed.isLocked || computed.isExpired || computed.isGrace) && (
              <button
                onClick={handleUnlock}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95
                           transition-all disabled:opacity-50 border border-emerald-200"
              >
                <Unlock className="w-3.5 h-3.5" />Активирай (+30д)
              </button>
            )}
            {/* Гратисен — само при active */}
            {!computed.isLocked && !computed.isExpired && !computed.isGrace && (
              <button
                onClick={handleGrace}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-amber-50 text-amber-700 hover:bg-amber-100 active:scale-95
                           transition-all disabled:opacity-50 border border-amber-200"
              >
                <Hourglass className="w-3.5 h-3.5" />Гратисен
              </button>
            )}
            {/* Заключи — при active и grace */}
            {!computed.isLocked && !computed.isExpired && (
              <button
                onClick={handleLock}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                           bg-red-50 text-red-600 hover:bg-red-100 active:scale-95
                           transition-all disabled:opacity-50 border border-red-200"
              >
                <Lock className="w-3.5 h-3.5" />Заключи
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
