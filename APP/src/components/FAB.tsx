import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface FABProps {
  onClick: () => void;
}

export const FAB: React.FC<FABProps> = ({ onClick }) => {
  const { t } = useLanguage();
  
  return (
    <button
      onClick={onClick}
      className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-full shadow-lg flex items-center justify-center z-40 active:scale-95 transition-all duration-150"
      style={{ minWidth: '56px', minHeight: '56px' }}
      aria-label={t('participants.add')}
    >
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
};
