import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { User } from '@supabase/supabase-js'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

const ALLOWED_ADMIN_EMAIL = 'ventsi.vutov@gmail.com'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setIsAuthorized(currentUser?.email === ALLOWED_ADMIN_EMAIL)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setIsAuthorized(currentUser?.email === ALLOWED_ADMIN_EMAIL)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAuthorized(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-8 bg-white rounded-lg shadow-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Unauthorized</h1>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this dashboard.
          </p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Logout
          </button>
        </div>
      </div>
    )
  }

  return <Dashboard user={user} onLogout={handleLogout} />
}

export default App
