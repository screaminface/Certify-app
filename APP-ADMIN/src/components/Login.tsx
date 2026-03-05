import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Lock, Shield, LogIn, Loader2, XCircle } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-4">
      <div className="max-w-md w-full p-8 sm:p-10 bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-4 shadow-lg">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            CERTIFY Admin
          </h1>
          <p className="flex items-center justify-center gap-2 text-gray-500 mt-2 text-sm sm:text-base">
            <Shield className="w-4 h-4" />
            Secure Dashboard Access
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-4 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl animate-shake">
              <p className="flex items-center gap-2 text-sm font-medium text-red-700">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg rounded-xl hover:shadow-xl disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Logging in...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <LogIn className="w-5 h-5" />
                Login
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
