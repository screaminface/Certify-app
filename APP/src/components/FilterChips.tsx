import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDateBG } from '../utils/medicalValidation';

interface FilterChipsProps {
  activeFilters: {
    searchText?: string;
    selectedGroup?: string;
    dateRange?: { start: string; end: string };
    statusFilters?: {
      sent: boolean | null;
      documents: boolean | null;
      handedOver: boolean | null;
      paid: boolean | null;
      completed: boolean | null;
    };
  };
  onRemoveFilter: (filterType: string, value?: string) => void;
  groups: Array<{ groupNumber: number; courseStartDate: string }>;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  activeFilters,
  onRemoveFilter
}) => {
  const { t } = useLanguage();
  const chips: Array<{ label: string; type: string; value?: string }> = [];

  if (activeFilters.searchText) {
    chips.push({ label: `${t('filters.search')}: "${activeFilters.searchText}"`, type: 'search' });
  }

  if (activeFilters.selectedGroup) {
    chips.push({
      label: `${t('filters.group')}: ${activeFilters.selectedGroup}`,
      type: 'group'
    });
  }

  if (activeFilters.dateRange?.start) {
    chips.push({ label: `${t('filters.from')}: ${formatDateBG(activeFilters.dateRange.start)}`, type: 'dateStart' });
  }

  if (activeFilters.dateRange?.end) {
    chips.push({ label: `${t('filters.to')}: ${formatDateBG(activeFilters.dateRange.end)}`, type: 'dateEnd' });
  }

  if (activeFilters.statusFilters) {
    Object.entries(activeFilters.statusFilters).forEach(([key, value]) => {
      if (value !== null) {
        const statusKey = `participant.${key}` as const;
        chips.push({
          label: `${t(statusKey)}: ${value ? t('filters.yes') : t('filters.no')}`,
          type: 'status',
          value: key
        });
      }
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {chips.map((chip, index) => (
        <button
          key={index}
          onClick={() => onRemoveFilter(chip.type, chip.value)}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 transition-colors duration-150"
        >
          <span>{chip.label}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
      <button
        onClick={() => onRemoveFilter('all')}
        className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-full text-sm hover:bg-slate-300 transition-colors duration-150"
      >
        Clear All
      </button>
    </div>
  );
};
