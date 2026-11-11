import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { ModalShell } from './ui/ModalShell';

/**
 * Two presentations of the same filter fields:
 *  - FiltersPanel  (md+): inline card in the content column, right under
 *    the "Филтри" button — no overlay, results update in view. The old left
 *    drawer sat far away from both the button and the table it filters.
 *  - FiltersDrawer (<md): the bottom sheet, unchanged behavior.
 */

interface FilterFieldProps {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  selectedGroup: string;
  onSelectedGroupChange: (value: string) => void;
  statusFilters: {
    sent: boolean | null;
    documents: boolean | null;
    handedOver: boolean | null;
    paid: boolean | null;
    completed: boolean | null;
  };
  onStatusFilterChange: (filter: keyof FilterFieldProps['statusFilters'], value: boolean | null) => void;
  dateRange: {
    start: string;
    end: string;
  };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  groups: Array<{ groupNumber: number; courseStartDate: string }>;
  onResetToDefaults: () => void;
}

interface FiltersDrawerProps extends FilterFieldProps {
  isOpen: boolean;
  onClose: () => void;
  visibleCount?: number;
  totalCount?: number;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

const StatusFilterButton: React.FC<{
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}> = ({ label, value, onChange }) => {
  const { t } = useLanguage();
  const base = 'px-2 py-1.5 text-sm rounded-lg min-h-[36px] font-medium transition-colors duration-150';
  const off = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
  return (
    <div role="group" aria-label={label}>
      <span className="text-sm font-medium text-slate-700 mb-1.5 block">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={`${base} ${value === null ? 'bg-slate-500 text-white' : off}`}
        >
          {t('filters.all')}
        </button>
        <button
          type="button"
          aria-pressed={value === true}
          onClick={() => onChange(true)}
          className={`${base} ${value === true ? 'bg-emerald-600 text-white' : off}`}
        >
          {t('filters.yes')}
        </button>
        <button
          type="button"
          aria-pressed={value === false}
          onClick={() => onChange(false)}
          className={`${base} ${value === false ? 'bg-red-600 text-white' : off}`}
        >
          {t('filters.no')}
        </button>
      </div>
    </div>
  );
};

/** The fields themselves. layout='grid' spreads them in columns (inline
 *  panel); layout='column' stacks them (bottom sheet). */
const FilterFields: React.FC<FilterFieldProps & {
  layout: 'grid' | 'column';
  onSubmit?: () => void;
  pollIme?: boolean;
}> = ({
  searchText, onSearchTextChange, selectedGroup, onSelectedGroupChange,
  statusFilters, onStatusFilterChange, dateRange, onDateRangeChange,
  groups, layout, onSubmit, pollIme = false
}) => {
  const { t } = useLanguage();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  // Poll input value continuously (fixes Android IME composition)
  useEffect(() => {
    if (!pollIme) return;
    pollingIntervalRef.current = window.setInterval(() => {
      if (searchInputRef.current) {
        const currentValue = searchInputRef.current.value;
        if (currentValue !== searchText) {
          onSearchTextChange(currentValue);
        }
      }
    }, 100);
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [pollIme, searchText, onSearchTextChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit?.();
  };

  const inputClass = 'w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[44px] transition-colors duration-150';
  const isGrid = layout === 'grid';
  const idPrefix = `filters-${layout}`;

  return (
    <>
      <div className={isGrid ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' : ''}>
        {/* Search */}
        <div className={isGrid ? '' : 'mb-4'}>
          <label htmlFor={`${idPrefix}-search`} className="block text-sm font-medium text-slate-700 mb-2">
            {t('filters.search')}
          </label>
          <input
            id={`${idPrefix}-search`}
            ref={searchInputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('filters.searchPlaceholder')}
            className={inputClass}
          />
        </div>

        {/* Group Filter */}
        <div className={isGrid ? '' : 'mb-4'}>
          <label htmlFor={`${idPrefix}-group`} className="block text-sm font-medium text-slate-700 mb-2">
            {t('filters.group')}
          </label>
          <select
            id={`${idPrefix}-group`}
            value={selectedGroup}
            onChange={(e) => onSelectedGroupChange(e.target.value)}
            className={inputClass}
          >
            <option value="">{t('filters.allGroups')}</option>
            {groups.map((group) => (
              <option key={group.groupNumber} value={group.groupNumber.toString()}>
                {t('filters.groupOption', { number: group.groupNumber.toString(), date: group.courseStartDate })}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className={isGrid ? '' : 'mb-4'}>
          <label htmlFor={`${idPrefix}-from`} className="block text-sm font-medium text-slate-700 mb-2">
            {t('filters.dateRange')}
          </label>
          <div className={isGrid ? 'flex gap-2' : 'space-y-2'}>
            <input
              id={`${idPrefix}-from`}
              type="date"
              value={dateRange.start}
              onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
              onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              className={`${inputClass} cursor-pointer`}
            />
            <input
              type="date"
              aria-label={t('filters.dateRange')}
              value={dateRange.end}
              onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
              onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              className={`${inputClass} cursor-pointer`}
            />
          </div>
        </div>
      </div>

      {/* Status Filters. In the grid layout thin vertical rules keep the
          five chip groups from reading as one long row. */}
      <div className="border-t border-slate-200 pt-4 mt-4">
        <h4 className="font-medium text-slate-900 mb-4">{t('filters.statusFilters')}</h4>
        <div className={isGrid
          ? 'grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-x-0 lg:divide-x lg:divide-slate-200'
          : 'space-y-3'
        }>
          {([
            { key: 'sent' as const, label: t('participant.sent') },
            { key: 'documents' as const, label: t('participant.documents') },
            { key: 'handedOver' as const, label: t('participant.handed') },
            { key: 'paid' as const, label: t('participant.paid') },
            { key: 'completed' as const, label: t('participant.completed') },
          ]).map(({ key, label }) => (
            <div key={key} className={isGrid ? 'lg:px-4 lg:first:pl-0 lg:last:pr-0' : ''}>
              <StatusFilterButton
                label={label}
                value={statusFilters[key]}
                onChange={(v) => onStatusFilterChange(key, v)}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

function clearAllFilters(p: FilterFieldProps) {
  p.onSearchTextChange('');
  p.onSelectedGroupChange('');
  p.onDateRangeChange({ start: '', end: '' });
  p.onStatusFilterChange('sent', null);
  p.onStatusFilterChange('documents', null);
  p.onStatusFilterChange('handedOver', null);
  p.onStatusFilterChange('paid', null);
  p.onStatusFilterChange('completed', null);
  p.onResetToDefaults();
}

const CloseIcon: React.FC<{ className: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CountBadge: React.FC<{ visibleCount?: number; totalCount?: number }> = ({ visibleCount, totalCount }) =>
  visibleCount !== undefined && totalCount !== undefined ? (
    <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
      {visibleCount} / {totalCount}
    </span>
  ) : null;

/** Desktop (md+): inline card under the "Филтри" button. Filters apply
 *  live — no Apply button; the header offers clear-all and collapse. */
export const FiltersPanel: React.FC<FiltersDrawerProps> = (props) => {
  const { isOpen, onClose, visibleCount, totalCount } = props;
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <section
      aria-label={t('filters.title')}
      className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900">{t('filters.title')}</h3>
          <CountBadge visibleCount={visibleCount} totalCount={totalCount} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => clearAllFilters(props)}
            className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium transition-colors duration-150"
          >
            {t('filters.clearAll')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg min-w-[36px] min-h-[36px] transition-colors duration-150 text-slate-500 hover:text-slate-700"
            aria-label={t('common.close')}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <FilterFields {...props} layout="grid" onSubmit={onClose} />
    </section>
  );
};

/** Mobile (<md): bottom sheet. Returns null on desktop so the ModalShell
 *  (focus trap, scroll lock) never mounts invisibly. */
export const FiltersDrawer: React.FC<FiltersDrawerProps> = (props) => {
  const { isOpen, onClose, visibleCount, totalCount } = props;
  const { t } = useLanguage();
  const isDesktop = useIsDesktop();

  if (!isOpen || isDesktop) return null;

  return (
    <ModalShell onClose={onClose}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('filters.title')}
        className="fixed z-50 bg-white shadow-2xl bottom-0 left-0 right-0 max-h-[90vh] rounded-t-3xl flex flex-col"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header - Sticky */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-slate-200 z-10">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900">{t('filters.title')}</h3>
            <CountBadge visibleCount={visibleCount} totalCount={totalCount} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg min-w-[44px] min-h-[44px] transition-colors duration-150"
            aria-label={t('common.close')}
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="p-4 pb-4 flex-1 overflow-y-auto overscroll-contain">
          <FilterFields {...props} layout="column" onSubmit={onClose} pollIme />

          {/* Action Buttons */}
          <div className="mt-6 mb-6 pb-8 flex gap-3">
            <button
              type="button"
              onClick={() => clearAllFilters(props)}
              className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium min-h-[48px] transition-colors duration-150"
            >
              {t('filters.clearAll')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium min-h-[48px] transition-colors duration-150"
            >
              {t('filters.apply')}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
