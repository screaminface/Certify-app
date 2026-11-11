// Single source of truth for the selectable companies.
// To add a company: append it here (and optionally give it a colour below).
export const COMPANIES = ['Egida', 'D-Max', 'Multiforce', 'Мануил'] as const;

export type CompanyName = (typeof COMPANIES)[number];

interface CompanyStyle {
  /** Pill used in tables/cards (CompanyBadge) */
  badge: string;
  /** Small colour dot used in pickers */
  dot: string;
}

export const COMPANY_STYLES: Record<string, CompanyStyle> = {
  'Egida':      { badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/50', dot: 'bg-violet-500' },
  'D-Max':      { badge: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/50', dot: 'bg-orange-500' },
  'Multiforce': { badge: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/50',       dot: 'bg-cyan-500' },
  'Мануил':     { badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/50',       dot: 'bg-rose-500' },
};

export const DEFAULT_COMPANY_STYLE: CompanyStyle = {
  badge: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200/50',
  dot: 'bg-slate-400',
};

export const getCompanyStyle = (name: string): CompanyStyle =>
  COMPANY_STYLES[name] ?? DEFAULT_COMPANY_STYLE;
