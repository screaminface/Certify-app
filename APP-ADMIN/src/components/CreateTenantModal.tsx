import { useState } from 'react'
import { X, Plus, Building2, Mail, Lock, Code, Calendar } from 'lucide-react'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Validation
      if (formData.password.length < 8) {
        throw new Error('Паролата трябва да е поне 8 символа')
      }

      console.log('🔵 Step 1: Creating owner user...')
      
      // Step 1: Create auth user with signUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            tenant_code: formData.code,
            tenant_name: formData.name
          }
        }
      })

      if (authError) {
        if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
          throw new Error(`Email ${formData.email} вече е регистриран`)
        }
        throw authError
      }

      if (!authData.user) {
        throw new Error('Failed to create user')
      }

      console.log('🟢 User created:', authData.user.id)
      console.log('🔵 Step 2: Creating tenant structure...')

      // Step 2: Create tenant + subscription + profile + membership
      const { data, error: rpcError } = await supabase.rpc('admin_create_tenant_with_user', {
        p_user_id: authData.user.id,
        p_tenant_name: formData.name,
        p_tenant_code: formData.code,
        p_owner_email: formData.email,
        p_plan_code: formData.plan,
        p_days: formData.days
      })

      if (rpcError) throw rpcError
      
      const result = data as { success: boolean; error?: string; tenant_code?: string; plan?: string; days?: number }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create tenant')
      }

      console.log('🟢 Tenant created successfully!')
      alert(`✅ Фирма създадена успешно!\n\n🏢 Име: ${formData.name}\n🔑 Код: ${formData.code}\n\n📧 Login Email: ${formData.email}\n🔐 Парола: ${formData.password}\n\n📅 План: ${result.plan} (${result.days} дни)\n\n⚠️ Owner трябва да потвърди email-а си (провери inbox).`)
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('❌ Create tenant error:', err)
      let errorMsg = err.message || 'Failed to create tenant'
      
      // Friendly error messages
      if (errorMsg.includes('already exists')) {
        errorMsg = `Tenant код "${formData.code}" вече съществува`
      } else if (errorMsg.includes('already registered')) {
        errorMsg = `Email ${formData.email} вече е регистриран`
      } else if (errorMsg.includes('Password')) {
        errorMsg = 'Паролата трябва да е поне 8 символа'
      }
      
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Plus className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold">Create New Tenant</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Tenant Name */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-bold text-gray-700 mb-2">
              <Building2 className="w-4 h-4" />
              <span>Tenant Name</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="My Company Ltd"
              required
            />
          </div>

          {/* Tenant Code */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-bold text-gray-700 mb-2">
              <Code className="w-4 h-4" />
              <span>Tenant Code (unique)</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono"
              placeholder="my-company"
              pattern="^[a-z0-9][a-z0-9_-]{2,32}$"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, dashes, underscores (3-32 chars)</p>
          </div>

          {/* Owner Email */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-bold text-gray-700 mb-2">
              <Mail className="w-4 h-4" />
              <span>Owner Email (за login)</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="owner@company.com"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Email за влизане в CERTIFY апп</p>
          </div>

          {/* Password */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-bold text-gray-700 mb-2">
              <Lock className="w-4 h-4" />
              <span>Парола за owner</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="••••••••"
              minLength={8}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Минимум 8 символа</p>
          </div>

          {/* Plan */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-bold text-gray-700 mb-2">
              <Calendar className="w-4 h-4" />
              <span>Initial Plan</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, plan: 'monthly', days: 30 })}
                className={`px-4 py-3 rounded-xl font-bold transition ${
                  formData.plan === 'monthly'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📆 Monthly (30d)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, plan: 'yearly', days: 365 })}
                className={`px-4 py-3 rounded-xl font-bold transition ${
                  formData.plan === 'yearly'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📅 Yearly (365d)
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl">
              <p className="text-sm font-medium text-red-700">❌ {error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:shadow-xl disabled:from-gray-400 disabled:to-gray-500 transition hover:scale-105 active:scale-95"
            >
              {loading ? '⏳ Creating...' : '🚀 Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
