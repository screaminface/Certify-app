import React, { useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface FiltersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
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
  onStatusFilterChange: (filter: keyof FiltersDrawerProps['statusFilters'], value: boolean | null) => void;
  dateRange: {
    start: string;
    end: string;
  };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  groups: Array<{ groupNumber: number; courseStartDate: string }>;
  onResetToDefaults: () => void;
}

export const FiltersDrawer: React.FC<FiltersDrawerProps> = ({
  isOpen,
  onClose,
  searchText,
  onSearchTextChange,
  selectedGroup,
  onSelectedGroupChange,
  statusFilters,
  onStatusFilterChange,
  dateRange,
  onDateRangeChange,
  groups,
  onResetToDefaults
}) => {
  const { t } = useLanguage();
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onClose();
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const StatusFilterButton: React.FC<{
    label: string;
    value: boolean | null;
    onChange: (value: boolean | null) => void;
  }> = ({ label, value, onChange }) => (
    <div className="mb-3">
      <span className="text-sm font-medium text-slate-700 mb-1.5 block">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onChange(null)}
          className={`px-2 py-1.5 text-sm rounded-lg min-h-[36px] font-medium transition-colors duration-150 ${
            value === null ? 'bg-slate-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {t('filters.all')}
        </button>
        <button
          onClick={() => onChange(true)}
          className={`px-2 py-1.5 text-sm rounded-lg min-h-[36px] font-medium transition-colors duration-150 ${
            value === true ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {t('filters.yes')}
        </button>
        <button
          onClick={() => onChange(false)}
          className={`px-2 py-1.5 text-sm rounded-lg min-h-[36px] font-medium transition-colors duration-150 ${
            value === false ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {t('filters.no')}
        </button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer - Left side on desktop, bottom sheet on mobile */}
      <div
        className={`fixed z-50 bg-white shadow-2xl transition-transform
          md:top-0 md:left-0 md:h-dvh md:w-[360px] lg:w-[420px] md:max-w-[480px] md:translate-x-0
          bottom-0 left-0 right-0 max-h-[90vh] rounded-t-3xl md:rounded-none flex flex-col
          ${isOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0 md:-translate-x-full'}
        `}
      >
        {/* Handle for mobile */}
        <div className="md:hidden flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header - Sticky */}
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-slate-200 z-10">
          <h3 className="text-lg font-bold text-slate-900">{t('filters.title')}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg min-w-[44px] min-h-[44px] transition-colors duration-150"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - scrollable with padding for safe area */}
        <div className="p-4 pb-4 flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {/* Search */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('filters.search')}
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => onSearchTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('filters.searchPlaceholder')}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[44px] transition-colors duration-150"
            />
          </div>

          {/* Group Filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('filters.group')}
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => onSelectedGroupChange(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[44px] transition-colors duration-150"
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
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('filters.dateRange')}
            </label>
            <div className="space-y-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[44px] transition-colors duration-150 cursor-pointer"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[44px] transition-colors duration-150 cursor-pointer"
              />
            </div>
          </div>

          {/* Status Filters */}
          <div className="border-t border-slate-200 pt-4 mt-4">
            <h4 className="font-medium text-slate-900 mb-4">{t('filters.statusFilters')}</h4>
            <StatusFilterButton
              label={t('participant.sent')}
              value={statusFilters.sent}
              onChange={(v) => onStatusFilterChange('sent', v)}
            />
            <StatusFilterButton
              label={t('participant.documents')}
              value={statusFilters.documents}
              onChange={(v) => onStatusFilterChange('documents', v)}
            />
            <StatusFilterButton
              label={t('participant.handed')}
              value={statusFilters.handedOver}
              onChange={(v) => onStatusFilterChange('handedOver', v)}
            />
            <StatusFilterButton
              label={t('participant.paid')}
              value={statusFilters.paid}
              onChange={(v) => onStatusFilterChange('paid', v)}
            />
            <StatusFilterButton
              label={t('participant.completed')}
              value={statusFilters.completed}
              onChange={(v) => onStatusFilterChange('completed', v)}
            />
          </div>
        </div>

        {/* Sticky Footer - Both Mobile and Desktop */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 flex gap-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
          <button
            onClick={() => {
              onSearchTextChange('');
              onSelectedGroupChange('');
              onDateRangeChange({ start: '', end: '' });
              onStatusFilterChange('sent', null);
              onStatusFilterChange('documents', null);
              onStatusFilterChange('handedOver', null);
              onStatusFilterChange('paid', null);
              onStatusFilterChange('completed', null);
              onResetToDefaults();
            }}
            className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium min-h-[48px] transition-colors duration-150"
          >
            {t('filters.clearAll')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium min-h-[48px] transition-colors duration-150"
          >
            {t('filters.apply')}
          </button>
        </div>
      </div>
    </>
  );
};
