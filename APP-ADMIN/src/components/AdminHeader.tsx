import { Search, Plus, RefreshCw, LogOut } from 'lucide-react'

interface AdminHeaderProps {
  userEmail: string
  searchQuery: string
  onSearchChange: (query: string) => void
  onAddTenant: () => void
  onRefresh: () => void
  onLogout: () => void
  refreshing?: boolean
}

export default function AdminHeader({
  userEmail,
  searchQuery,
  onSearchChange,
  onAddTenant,
  onRefresh,
  onLogout,
  refreshing = false
}: AdminHeaderProps) {
  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-lg border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main header row */}
        <div className="flex items-center justify-between py-4 gap-4">
          {/* Left: Branding */}
          <div className="flex-shrink-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              CERTIFY <span className="text-indigo-600">Control</span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">{userEmail}</p>
          </div>

          {/* Center: Search (desktop) */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Търси компании..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-2.5 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50 active:scale-95 border border-slate-200"
              title="Обнови"
            >
              <RefreshCw className={`w-5 h-5 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onAddTenant}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Добави компания</span>
              <span className="sm:hidden">Добави</span>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold transition-all active:scale-95 border border-slate-200"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Изход</span>
            </button>
          </div>
        </div>

        {/* Search (mobile) */}
        <div className="md:hidden pb-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Търси компании..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
