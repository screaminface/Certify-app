import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Users, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'participants' | 'tools';
  onTabChange: (tab: 'participants' | 'tools') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { t } = useLanguage();
  
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-sm z-50">
      <div className="flex">
        <button
          onClick={() => onTabChange('participants')}
          className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors duration-150 ${
            activeTab === 'participants' ? 'text-blue-700' : 'text-slate-400'
          }`}
        >
          <Users className="w-6 h-6 mb-1" strokeWidth={2} />
          <span className={`text-xs ${activeTab === 'participants' ? 'font-semibold' : 'font-medium'}`}>{t('nav.participants')}</span>
        </button>
        
        <button
          onClick={() => onTabChange('tools')}
          className={`flex-1 flex flex-col items-center justify-center py-3 transition-colors duration-150 ${
            activeTab === 'tools' ? 'text-blue-700' : 'text-slate-400'
          }`}
        >
          <Settings className="w-6 h-6 mb-1" strokeWidth={2} />
          <span className={`text-xs ${activeTab === 'tools' ? 'font-semibold' : 'font-medium'}`}>{t('nav.tools')}</span>
        </button>
      </div>
    </nav>
  );
};
