import React from 'react';
import { getCompanyStyle } from '../../constants/companies';

interface CompanyBadgeProps {
  companyName: string;
  className?: string;
}

export const CompanyBadge: React.FC<CompanyBadgeProps> = ({ companyName, className = '' }) => {
  const colorClass = getCompanyStyle(companyName).badge;

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
