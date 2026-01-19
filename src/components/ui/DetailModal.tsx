import React, { useEffect } from 'react';
import { User, Calendar, MapPin, Hash, Clock, X } from 'lucide-react';
import { Participant } from '../../db/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDateBG } from '../../utils/medicalValidation';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: Participant | undefined;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  participant
}) => {
  const { t } = useLanguage();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !participant) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-up pointer-events-auto">
          {/* Header */}
          <div className="relative bg-slate-50 px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900 truncate pr-6">
                  {participant.personName}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {participant.companyName}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="absolute right-4 top-4 p-1 rounded-full hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Hash className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {t('participant.egn')}
                  </span>
                </div>
                <div className="text-sm font-mono text-slate-900 bg-slate-50 px-2 py-1 rounded">
                  {participant.egn || '---'}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {t('participant.birthPlace')}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-900 truncate">
                  {participant.birthPlace || '---'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {t('participant.added')}
                  </span>
                </div>
                <div className="text-xs text-slate-900">
                  {participant.createdAt ? formatDateBG(participant.createdAt) : '---'}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {t('participant.modified')}
                  </span>
                </div>
                <div className="text-xs text-slate-900">
                  {participant.updatedAt ? formatDateBG(participant.updatedAt) : '---'}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 font-medium text-sm transition-all"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
