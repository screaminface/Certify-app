import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Participant } from '../../db/database';
import { useLanguage } from '../../contexts/LanguageContext';

interface ArchiveGroupEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupNumber: number;
  participants: Participant[];
  updateArchivedParticipantStatus: (id: string, updates: Partial<Pick<Participant, 'sent' | 'documents' | 'handedOver' | 'paid'>>) => Promise<void>;
}

const FIELDS = ['sent', 'documents', 'handedOver', 'paid'] as const;
type Field = typeof FIELDS[number];

export const ArchiveGroupEditModal: React.FC<ArchiveGroupEditModalProps> = ({
  isOpen,
  onClose,
  groupNumber,
  participants,
  updateArchivedParticipantStatus,
}) => {
  const { t } = useLanguage();
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Animate in/out
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, onClose]);

  const handleToggle = useCallback(
    async (participant: Participant, field: Field) => {
      setSavingIds((prev) => new Set(prev).add(participant.id));
      try {
        await updateArchivedParticipantStatus(participant.id, { [field]: !participant[field] });
      } catch (e) {
        console.error('Error updating archived participant:', e);
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(participant.id);
          return next;
        });
      }
    },
    [updateArchivedParticipantStatus]
  );

  const getCompleted = (p: Participant) =>
    p.completedOverride !== null ? p.completedOverride : p.completedComputed;

  if (!isOpen) return null;

  const fieldLabel: Record<Field, string> = {
    sent: t('participant.sent'),
    documents: t('participant.documents'),
    handedOver: t('participant.handedOver'),
    paid: t('participant.paid'),
  };

  const fieldStyle: Record<Field, React.CSSProperties> = {
    sent:       { background: 'linear-gradient(135deg, #E8F1FF, #DCE9FF)', color: '#2F5FD0', border: '1px solid #C9DBFF' },
    documents:  { background: 'linear-gradient(135deg, #F1E9FF, #E8DAFF)', color: '#6B3FD6', border: '1px solid #DCCBFF' },
    handedOver: { background: 'linear-gradient(135deg, #FFF3E3, #FFE9CC)', color: '#D97706', border: '1px solid #FFE0B5' },
    paid:       { background: 'linear-gradient(135deg, #E8F7EF, #D8F2E6)', color: '#1F8A5A', border: '1px solid #C9EEDB' },
  };

  const fieldStyleOff: React.CSSProperties = { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* ── MOBILE: Bottom Sheet ── DESKTOP: Centered modal ── */}

      {/* DESKTOP (sm+) */}
      <div className="hidden sm:flex fixed inset-0 z-50 items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col transition-all duration-300 overflow-hidden"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.96)' }}
        >
          {/* Top accent line */}
          <div className="h-[3px] flex-shrink-0" style={{ background: 'linear-gradient(90deg, #2F5FD0 0%, #6B3FD6 33%, #D97706 66%, #1F8A5A 100%)' }} />
          <ModalHeader groupNumber={groupNumber} onClose={onClose} t={t} />
          <ModalBody
            participants={participants}
            savingIds={savingIds}
            handleToggle={handleToggle}
            getCompleted={getCompleted}
            fieldLabel={fieldLabel}
            fieldStyle={fieldStyle}
            fieldStyleOff={fieldStyleOff}
            t={t}
            view="table"
          />
          <ModalFooter onClose={onClose} t={t} />
        </div>
      </div>

      {/* MOBILE: Bottom Sheet */}
      <div
        ref={sheetRef}
        className="sm:hidden fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white rounded-t-3xl shadow-2xl"
        style={{
          maxHeight: '92dvh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <div className="w-10 rounded-full" style={{ height: '4px', background: '#D1D5DB' }} />
        </div>

        <ModalHeader groupNumber={groupNumber} onClose={onClose} t={t} />

        <ModalBody
          participants={participants}
          savingIds={savingIds}
          handleToggle={handleToggle}
          getCompleted={getCompleted}
          fieldLabel={fieldLabel}
          fieldStyle={fieldStyle}
          fieldStyleOff={fieldStyleOff}
          t={t}
          view="cards"
        />

        <ModalFooter onClose={onClose} t={t} />
      </div>
    </>
  );
};

/* ─── Sub-components ─────────────────────────────────────────── */

function ModalHeader({ groupNumber, onClose, t }: { groupNumber: number; onClose: () => void; t: (k: string) => string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
      <div>
        <h2 className="text-base font-bold text-slate-900 leading-tight">
          {t('archiveEdit.title').replace('{number}', String(groupNumber))}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{t('archiveEdit.desc')}</p>
      </div>
      <button
        onClick={onClose}
        className="ml-3 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors flex-shrink-0"
        aria-label={t('common.close')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function ModalFooter({ onClose, t }: { onClose: () => void; t: (k: string) => string }) {
  return (
    <div className="px-5 py-3 border-t border-slate-100 flex justify-end flex-shrink-0">
      <button
        onClick={onClose}
        className="px-5 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors"
      >
        {t('common.close')}
      </button>
    </div>
  );
}

function ModalBody({
  participants, savingIds, handleToggle, getCompleted,
  fieldLabel, fieldStyle, fieldStyleOff, t, view,
}: {
  participants: Participant[];
  savingIds: Set<string>;
  handleToggle: (p: Participant, f: Field) => void;
  getCompleted: (p: Participant) => boolean;
  fieldLabel: Record<Field, string>;
  fieldStyle: Record<Field, React.CSSProperties>;
  fieldStyleOff: React.CSSProperties;
  t: (k: string) => string;
  view: 'table' | 'cards';
}) {
  if (participants.length === 0) {
    return <p className="text-center text-slate-400 py-12 text-sm flex-1">{t('archiveEdit.noParticipants')}</p>;
  }

  const FIELDS: Field[] = ['sent', 'documents', 'handedOver', 'paid'];

  if (view === 'table') {
    return (
      <div className="flex-1 overflow-y-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                {t('participant.personName')}
              </th>
              {FIELDS.map(f => (
                <th key={f} className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  {fieldLabel[f]}
                </th>
              ))}
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                {t('filters.status')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {participants.map((p) => {
              const isSaving = savingIds.has(p.id);
              const completed = getCompleted(p);
              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{p.personName}</td>
                  {FIELDS.map(f => (
                    <td key={f} className="px-3 py-3.5 text-center">
                      <button
                        onClick={() => handleToggle(p, f)}
                        disabled={isSaving}
                        className="px-3 py-1 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 min-w-[56px]"
                        style={p[f] ? fieldStyle[f] : fieldStyleOff}
                      >
                        {p[f] ? '✓' : '—'}
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-3.5 text-center">
                    <StatusBadge completed={completed} t={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // MOBILE CARDS
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ paddingBottom: 'max(80px, calc(env(safe-area-inset-bottom) + 80px))' }}>
      {participants.map((p) => {
        const isSaving = savingIds.has(p.id);
        const completed = getCompleted(p);
        return (
          <div key={p.id} className="rounded-2xl p-4" style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.02)' }}>
            {/* Name + status */}
            <div className="flex items-center justify-between mb-3">
              <span className="leading-tight flex-1 pr-2" style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{p.personName}</span>
              <StatusBadge completed={completed} t={t} />
            </div>
            {/* Toggle chips — 2×2 grid */}
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map(f => (
                <button
                  key={f}
                  onClick={() => handleToggle(p, f)}
                  disabled={isSaving}
                  className="flex items-center justify-between px-3 rounded-xl font-semibold disabled:opacity-40 select-none"
                  style={{ ...(p[f] ? fieldStyle[f] : fieldStyleOff), height: '44px', fontSize: '14px', transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)' }}
                >
                  <span>{fieldLabel[f]}</span>
                  <span className="ml-2 text-base leading-none">{p[f] ? '✓' : '○'}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ completed, t }: { completed: boolean; t: (k: string) => string }) {
  if (completed) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
        style={{ background: '#E7F7EE', color: '#166534', border: '1px solid #C3EED6' }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        {t('participant.completedBadge')}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}
    >
      {t('completed.pending')}
    </span>
  );
}