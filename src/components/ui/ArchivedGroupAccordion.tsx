import React, { useState } from 'react';
import { Participant } from '../../db/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDateBG } from '../../utils/medicalValidation';

interface ArchivedGroupAccordionProps {
  groupNumber: number;
  courseStartDate: string;
  courseEndDate: string;
  participants: Participant[];
  renderParticipantRow: (participant: Participant) => React.ReactNode;
  mode?: 'table' | 'cards'; // Determine if we render table or card list
}

export const ArchivedGroupAccordion: React.FC<ArchivedGroupAccordionProps> = ({
  groupNumber,
  courseStartDate,
  courseEndDate,
  participants,
  renderParticipantRow,
  mode = 'table'
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ 
    key: 'uniqueNumber' | null; 
    direction: 'asc' | 'desc' 
  }>({ key: 'uniqueNumber', direction: 'desc' });

  const handleSort = (key: 'uniqueNumber') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedParticipants = React.useMemo(() => {
    if (!sortConfig.key) return participants;

    return [...participants].sort((a, b) => {
      if (sortConfig.key === 'uniqueNumber') {
        const valA = a.uniqueNumber || '';
        const valB = b.uniqueNumber || '';
        return sortConfig.direction === 'asc' 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return 0;
    });
  }, [participants, sortConfig]);

  return (
    <div className="border border-slate-300 rounded-lg mb-2 bg-white shadow-sm transition-shadow duration-150">
      {/* Group Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-all duration-150 rounded-lg active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-5 h-5 text-slate-600 transition-transform duration-200 ease-out ${isExpanded ? 'rotate-90' : ''}`}
            style={{ transformOrigin: 'center' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="text-left">
            <div className="font-semibold text-slate-900">Група {groupNumber}</div>
            <div className="text-sm text-slate-600">
              {formatDateBG(courseStartDate)} - {formatDateBG(courseEndDate)}
            </div>
          </div>
        </div>
        <div className="text-sm text-slate-600 font-medium">
          {participants.length} {participants.length === 1 ? 'участник' : 'участника'}
        </div>
      </button>

      {/* Expanded Content - Smooth animation */}
      <div
        className={`grid transition-all ease-in-out border-t border-slate-200 ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        style={{
          transitionDuration: '180ms',
          transitionProperty: 'grid-template-rows, opacity',
          willChange: isExpanded ? 'grid-template-rows, opacity' : 'auto'
        }}
      >
        <div className="overflow-hidden">
          <div
            className={`transition-transform duration-180 ease-out ${
              isExpanded ? 'translate-y-0' : 'translate-y-[-8px]'
            }`}
            style={{ willChange: isExpanded ? 'transform' : 'auto' }}
          >
            {mode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.companyName')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.personName')}
                      </th>
                      <th 
                        className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => handleSort('uniqueNumber')}
                        title="Sort by Number"
                      >
                        <div className="flex items-center gap-1">
                          {t('participant.uniqueNumber')}
                          {sortConfig.key === 'uniqueNumber' && (
                            <span className="text-slate-500">
                              {sortConfig.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.medicalDate')}
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.sent')}
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.documents')}
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.handedOver')}
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.paid')}
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                        {t('participant.completed')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedParticipants.map(renderParticipantRow)}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {sortedParticipants.map(renderParticipantRow)}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Accessibility */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .grid, button, svg {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
};
