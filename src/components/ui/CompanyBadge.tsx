import React from 'react';

interface CompanyBadgeProps {
  companyName: string;
  className?: string;
}

const COMPANY_COLORS = {
  'Egida': 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/50',
  'D-Max': 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/50',
  'Multiforce': 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/50',
} as const;

const DEFAULT_STYLE = 'bg-slate-50 text-slate-600 ring-1 ring-slate-200/50';

export const CompanyBadge: React.FC<CompanyBadgeProps> = ({ companyName, className = '' }) => {
  const colorClass = COMPANY_COLORS[companyName as keyof typeof COMPANY_COLORS] || DEFAULT_STYLE;

  return (
    <span 
      className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full 
        font-medium tracking-normal transition-all duration-150 
        hover:ring-2 hover:shadow-sm ${colorClass} ${className}`}
      aria-label={`Company: ${companyName || 'Unknown'}`}
    >
      {companyName || 'Няма компания'}
    </span>
  );
};
