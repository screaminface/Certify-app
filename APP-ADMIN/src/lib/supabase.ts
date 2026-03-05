import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

// Основен клиент (anon key) — за всички RPC извиквания
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin клиент (service role key) — САМО за създаване на auth потребители
// Ако VITE_SUPABASE_SERVICE_ROLE_KEY не е зададен, е null → CreateTenantModal показва грешка
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

export const hasAdminClient = supabaseAdmin !== null
