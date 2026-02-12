import React from 'react';

interface StatusChipProps {
  label: string;
  isActive: boolean;
}

export const StatusChip: React.FC<StatusChipProps> = ({ label, isActive }) => {
  return (
    <div
      className={`
        flex items-center justify-center gap-1 px-1.5 py-1 rounded text-xs font-medium
        transition-all duration-150 min-h-[32px] w-full
        ${
          isActive
            ? 'bg-emerald-700 border border-emerald-700 text-white'
            : 'bg-white border border-slate-300 text-slate-700'
        }
      `}
    >
      {isActive && (
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
      <span className="text-[10px] whitespace-nowrap">{label}</span>
    </div>
  );
};
