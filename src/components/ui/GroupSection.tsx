import { ReactNode } from 'react';
import { Activity, CalendarClock, Archive } from 'lucide-react';

interface GroupSectionProps {
  title: string;
  count: number;
  groupNumbers?: number[]; // Optional array of group numbers to display
  dateRange?: string; // Optional date range to display (e.g., "26.01.2026 - 02.02.2026")
  participantCount?: number; // Optional participant count to display on the right
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  variant?: 'active' | 'planned' | 'completed';
}

export function GroupSection({
  title,
  count,
  groupNumbers,
  dateRange,
  participantCount,
  isCollapsed,
  onToggle,
  children,
  variant = 'active',
  showCount = true
}: GroupSectionProps & { showCount?: boolean }) {
  const variantConfig = {
    active: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      accent: 'border-l-blue-400',
      text: 'text-blue-900',
      countBg: 'bg-blue-100',
      countText: 'text-blue-700',
      icon: <Activity className="w-5 h-5 text-blue-600" strokeWidth={2} />
    },
    planned: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      accent: 'border-l-amber-400',
      text: 'text-amber-900',
      countBg: 'bg-amber-100',
      countText: 'text-amber-700',
      icon: <CalendarClock className="w-5 h-5 text-amber-600" strokeWidth={2} />
    },
    completed: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      accent: 'border-l-slate-400',
      text: 'text-slate-700',
      countBg: 'bg-slate-100',
      countText: 'text-slate-600',
      icon: <Archive className="w-5 h-5 text-slate-600" strokeWidth={2} />
    }
  };

  const config = variantConfig[variant];

  return (
    <div className="mb-4">
      {/* Section Container with subtle background and left accent */}
      <div className={`rounded-lg border ${config.border} ${config.bg} border-l-4 ${config.accent} overflow-hidden shadow-sm transition-shadow duration-150`}>
        {/* Section Header */}
        <button
          onClick={onToggle}
          className={`w-full flex items-center justify-between px-4 py-3.5 transition-all duration-150 hover:brightness-95 active:scale-[0.99] ${config.text}`}
        >
          <div className="flex items-center gap-3">
            {/* Status Icon */}
            <div className="flex-shrink-0">{config.icon}</div>
            
            {/* Title */}
            <span className="font-bold text-base">{title}</span>
            
            {/* Date Range (if provided) */}
            {dateRange && (
              <span className="text-sm font-medium opacity-75">
                {dateRange}
              </span>
            )}
            
            {/* Count Badge with optional group numbers */}
            {showCount && (
              groupNumbers && groupNumbers.length > 0 ? (
                <span className={`px-2.5 py-0.5 ${config.countBg} ${config.countText} rounded-full text-xs font-semibold`}>
                  {groupNumbers.length === 1 ? `№ ${groupNumbers[0]}` : `№ ${groupNumbers.join(', ')}`}
                </span>
              ) : (
                // Only show generic count for non-active groups (active is usually 1, which is redundant)
                variant !== 'active' && (
                  <span className={`px-2.5 py-0.5 ${config.countBg} ${config.countText} rounded-full text-xs font-semibold`}>
                    {count}
                  </span>
                )
              )
            )}
          </div>
          
          {/* Right side - Participant count (if provided) */}
          <div className="flex items-center gap-3">
            {participantCount !== undefined && (
              <span className={`text-sm font-medium ${config.text}`}>
                {participantCount} {participantCount === 1 ? 'участник' : 'участника'}
              </span>
            )}
            
            {/* Chevron icon */}
            <svg
              className={`w-5 h-5 transition-transform duration-200 ease-out ${isCollapsed ? '' : 'rotate-180'}`}
              style={{ transformOrigin: 'center' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Collapsible Content with smooth grid animation */}
        <div
          className={`grid transition-all duration-150 ease-in-out ${
            isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          }`}
          style={{
            transitionProperty: 'grid-template-rows, opacity',
            willChange: isCollapsed ? 'auto' : 'grid-template-rows, opacity'
          }}
        >
          <div className="overflow-hidden">
            <div 
              className={`px-1.5 sm:px-2 pb-2 transition-transform duration-150 ease-out ${
                isCollapsed ? 'translate-y-[-8px]' : 'translate-y-0'
              }`}
              style={{ willChange: isCollapsed ? 'auto' : 'transform' }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
      
      {/* Accessibility: Respect reduced motion preference */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .grid, button, svg {
            transition: none !important;
          }
        }
        
        @media (max-width: 768px) {
          .grid {
            transition-duration: 120ms !important;
          }
        }
      `}</style>
    </div>
  );
}
