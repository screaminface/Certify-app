import React from 'react';
import { X, Info, Calendar, Package, Users, Activity } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  
  if (!isOpen) return null;

  // Get version from Vite environment variable
  const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
  const buildDate = import.meta.env.VITE_BUILD_DATE || new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Info className="w-6 h-6 text-blue-600" strokeWidth={2} />
            <h3 className="text-xl font-bold text-slate-900">{t('about.title')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4">
          {/* App Name */}
          <div className="text-center py-4">
            <h2 className="text-2xl font-bold text-blue-600">CERTIFY</h2>
            <p className="text-sm text-slate-600 mt-1">{t('about.subtitle')}</p>
          </div>

          {/* Version Info */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-slate-600" strokeWidth={2} />
              <div>
                <div className="text-sm font-medium text-slate-700">{t('about.version')}</div>
                <div className="text-lg font-bold text-slate-900">{appVersion}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-slate-600" strokeWidth={2} />
              <div>
                <div className="text-sm font-medium text-slate-700">{t('about.buildDate')}</div>
                <div className="text-sm text-slate-900">{buildDate}</div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">{t('about.features')}</h4>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 mt-0.5 text-blue-600" strokeWidth={2} />
                <span>{t('about.feature1')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Activity className="w-4 h-4 mt-0.5 text-blue-600" strokeWidth={2} />
                <span>{t('about.feature2')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Package className="w-4 h-4 mt-0.5 text-blue-600" strokeWidth={2} />
                <span>{t('about.feature3')}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs text-center text-slate-500">
              {t('about.footer')}
            </p>
          </div>
        </div>

        {/* Close Button */}
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
