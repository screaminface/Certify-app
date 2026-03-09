import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
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
  defaultExpanded?: boolean; // Auto-expand when filters are active
  onEditGroup?: () => void; // Opens the archive-status edit modal
}

export const ArchivedGroupAccordion: React.FC<ArchivedGroupAccordionProps> = ({
  groupNumber,
  courseStartDate,
  courseEndDate,
  participants,
  renderParticipantRow,
  mode = 'table',
  defaultExpanded = false,
  onEditGroup,
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [sortConfig, setSortConfig] = useState<{ 
    key: 'uniqueNumber' | null; 
    direction: 'asc' | 'desc' 
  }>({ key: 'uniqueNumber', direction: 'desc' });

  // Close menu on outside click / Escape / scroll
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const closeEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    const closeScroll = () => setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeEsc);
    window.addEventListener('scroll', closeScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeEsc);
      window.removeEventListener('scroll', closeScroll, true);
    };
  }, [menuOpen]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuOpen) { setMenuOpen(false); return; }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
    }
    setMenuOpen(true);
  };

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
      <div className="flex items-center px-4 py-3 hover:bg-slate-50 transition-all duration-150 rounded-lg">
        {/* Expand / Collapse button (fills available space) */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center justify-between active:scale-[0.99] text-left"
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
              <div className="font-semibold text-slate-900">{t('group.group')} {groupNumber}</div>
              <div className="text-sm text-slate-600">
                {formatDateBG(courseStartDate)} - {formatDateBG(courseEndDate)}
              </div>
            </div>
          </div>
          <div className="text-sm text-slate-600 font-medium mr-2">
            {participants.length} {participants.length === 1 ? t('group.participant_one') : t('group.participant_other')}
          </div>
        </button>

        {/* Three-dot menu — only when onEditGroup is provided */}
        {onEditGroup && (
          <div className="flex-shrink-0">
            <button
              ref={btnRef}
              onClick={openMenu}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500 hover:text-slate-700 flex items-center justify-center min-w-[36px] min-h-[36px]"
              aria-label={t('common.edit')}
              aria-expanded={menuOpen}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="8" cy="2.5" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13.5" r="1.5" />
              </svg>
            </button>

            {menuOpen && menuPos && ReactDOM.createPortal(
              <div
                ref={menuRef}
                style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
                className="bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[160px] animate-scale-up"
              >
                <button
                  onClick={() => { setMenuOpen(false); onEditGroup(); }}
                  className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors duration-150"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {t('common.edit')}
                </button>
              </div>,
              document.body
            )}
          </div>
        )}
      </div>

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
                        {t('filters.status')}
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
