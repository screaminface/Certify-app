import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Users, Settings, Lock } from 'lucide-react';
import { isPinSet } from '../security/pinLock';
import { triggerManualLock } from './security/AppLockGate';

interface TopBarProps {
  activeTab: 'participants' | 'tools';
  onTabChange: (tab: 'participants' | 'tools') => void;
  onBack?: () => void;
  title?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onTabChange, onBack }) => {
  const { t } = useLanguage();
  
  return (
    <header className="bg-blue-700 text-white shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-2 hover:bg-blue-700 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          
          {/* Logo */}
          <div className="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 bg-white rounded-md flex items-center justify-center overflow-hidden">
            <img 
              src="./Logo.svg"
              alt="Logo" 
              className="w-full h-full object-cover scale-[2.4]"
            />
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">
              CERTIFY
            </h1>
            <p className="text-sm md:text-base text-blue-100">
              Удостоверяване и управление на обучения
            </p>
          </div>
          
          {/* Desktop Tabs */}
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => onTabChange('participants')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors duration-150 flex items-center gap-2 ${
                activeTab === 'participants'
                  ? 'bg-white text-blue-800'
                  : 'bg-blue-700/30 text-white hover:bg-blue-700/50'
              }`}
            >
              <Users className="w-5 h-5" strokeWidth={2} />
              {t('nav.participants')}
            </button>
            <button
              onClick={() => onTabChange('tools')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors duration-150 flex items-center gap-2 ${
                activeTab === 'tools'
                  ? 'bg-white text-blue-800'
                  : 'bg-blue-700/30 text-white hover:bg-blue-700/50'
              }`}
            >
              <Settings className="w-5 h-5" strokeWidth={2} />
              {t('nav.tools')}
            </button>

            {/* Lock Button (Only if PIN is set) */}
            {isPinSet() && (
              <button
                onClick={() => triggerManualLock()}
                className="px-4 py-2 ml-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/50 shadow-sm transition-all duration-150 flex items-center gap-2"
                title={t('nav.lock')}
              >
                <Lock className="w-5 h-5" strokeWidth={2} />
                <span className="hidden lg:inline">{t('nav.lock')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
