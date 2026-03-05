import { useState } from 'react'
import { X, Plus, Building2, Mail, Hash, Calendar, CalendarCheck, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface CreateTenantModalProps {
  onClose: () => void
  onSuccess: () => void
}

export default function CreateTenantModal({ onClose, onSuccess }: CreateTenantModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    email: '',
    password: '',
    plan: 'monthly' as 'monthly' | 'yearly',
    days: 30
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const validateCode = (code: string) => {
    if (!code) return ''
    if (code.length < 3) return 'At least 3 characters'
    if (code.length > 32) return 'Maximum 32 characters'
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(code)) return 'Must start with letter/digit, use only a-z, 0-9, -, _'
    return ''
  }

  const handleCodeChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-_]/g, '')
    setFormData({ ...formData, code: cleaned })
    
    const validation = validateCode(cleaned)
    setValidationErrors({ ...validationErrors, code: validation })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate
    const codeError = validateCode(formData.code)
    if (codeError) {
      setValidationErrors({ ...validationErrors, code: codeError })
      setLoading(false)
      return
    }

    try {
      // 1) Ако е въведена парола — създай auth потребителя чрез SECURITY DEFINER RPC
      if (formData.password) {
        const { data: createData, error: createErr } = await supabase.rpc('admin_create_user', {
          p_email: formData.email,
          p_password: formData.password,
        })
        if (createErr) throw new Error(`Грешка при създаване на потребител: ${createErr.message}`)
        const createResult = createData as { success: boolean; error?: string }
        if (!createResult?.success) throw new Error(createResult?.error || 'Create user failed')
      }

      // 2) Създай tenant + свържи user (SQL функцията търси по email)
      const { data, error: rpcError } = await supabase.rpc('admin_create_tenant', {
        p_tenant_name: formData.name,
        p_tenant_code: formData.code,
        p_contact_email: formData.email,
        p_plan_code: formData.plan,
        p_days: formData.days
      })

      if (rpcError) throw rpcError
      
      const result = data as { success: boolean; error?: string; tenant_code?: string; plan?: string; days?: number; user_linked?: boolean; user_created?: boolean }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create tenant')
      }

      console.log('Company created successfully!', result)
      let userMsg = ''
      if (result.user_created) {
        userMsg = `✅ Създаден нов акаунт за ${formData.email} с въведената парола.`
      } else if (result.user_linked) {
        userMsg = `✅ Свързан съществуващ акаунт: ${formData.email}`
      } else {
        userMsg = `⚠️ Не е намерен акаунт с email ${formData.email}.\nПотребителят трябва да се регистрира сам.`
      }
      alert(`✅ Компания добавена успешно!\n\n${formData.name}\nКод: ${result.tenant_code}\nПлан: ${result.plan} (${result.days} дни)\n\n${userMsg}`)
      onSuccess()
    } catch (err: any) {
      console.error('Create tenant error:', err)
      let errorMsg = err.message || 'Failed to create tenant'
      
      if (errorMsg.includes('already exists') || errorMsg.includes('unique constraint')) {
        errorMsg = `Tenant code "${formData.code}" вече съществува`
      } else if (errorMsg.includes('permission')) {
        errorMsg = 'Нямате права да създавате tenants'
      }
      
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slideUp">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-5 rounded-t-2xl border-b border-indigo-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Add New Tenant</h2>
                <p className="text-indigo-100 text-sm mt-0.5">Create a company subscription record</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">


          {/* Tenant Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>Company Name</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
              placeholder="Acme Corporation"
              required
              disabled={loading}
            />
          </div>

          {/* Tenant Code */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Hash className="w-4 h-4 text-indigo-600" />
              <span>Tenant Code</span>
              <span className="text-xs text-slate-500 font-normal">(unique identifier)</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className={`w-full px-4 py-2.5 bg-slate-50 border-2 rounded-xl focus:bg-white focus:ring-2 transition-all outline-none font-mono text-sm ${
                validationErrors.code
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500'
              }`}
              placeholder="acme-corp"
              required
              disabled={loading}
            />
            {validationErrors.code && (
              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <span className="inline-block w-1 h-1 bg-red-600 rounded-full"></span>
                {validationErrors.code}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1.5">
              Lowercase, 3-32 chars: a-z, 0-9, dash, underscore
            </p>
          </div>

          {/* Contact Email */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Mail className="w-4 h-4 text-indigo-600" />
              <span>Contact Email</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
              placeholder="admin@acme-corp.com"
              required
              disabled={loading}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Ако потребителят вече е регистриран, ще бъде свързан автоматично.
            </p>
          </div>

          {/* Password */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>Парола</span>
              <span className="text-xs text-slate-500 font-normal">(ако потребителят все още няма акаунт)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2.5 pr-11 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                placeholder="Остави празно ако акаунтът вече съществува"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Ако потребителят няма акаунт и въведеш парола, ще се създаде автоматично.
            </p>
          </div>

          {/* Plan Selector */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Subscription Plan</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, plan: 'monthly', days: 30 })}
                disabled={loading}
                className={`relative px-4 py-4 rounded-xl font-semibold transition-all border-2 ${
                  formData.plan === 'monthly'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                <Calendar className={`w-8 h-8 mx-auto mb-2 ${
                  formData.plan === 'monthly' ? 'text-white' : 'text-indigo-600'
                }`} />
                <div className="text-sm">Monthly</div>
                <div className="text-xs opacity-80 mt-0.5">30 days</div>
                {formData.plan === 'monthly' && (
                  <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full"></div>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, plan: 'yearly', days: 365 })}
                disabled={loading}
                className={`relative px-4 py-4 rounded-xl font-semibold transition-all border-2 ${
                  formData.plan === 'yearly'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                <CalendarCheck className={`w-8 h-8 mx-auto mb-2 ${
                  formData.plan === 'yearly' ? 'text-white' : 'text-indigo-600'
                }`} />
                <div className="text-sm">Yearly</div>
                <div className="text-xs opacity-80 mt-0.5">365 days</div>
                {formData.plan === 'yearly' && (
                  <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full"></div>
                )}
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !!validationErrors.code}
              className="flex-1 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Creating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create Tenant
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
