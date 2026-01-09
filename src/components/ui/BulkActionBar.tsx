import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBulkActions } from '../../hooks/useBulkActions';
import { ConfirmModal } from './ConfirmModal';

interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  selectedIds,
  onClearSelection,
  onActionComplete
}) => {
  const { t } = useLanguage();
  const { bulkSetFlag, bulkSetCompleted } = useBulkActions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const handleBulkAction = async (
    action: 'sent' | 'documents' | 'handedOver' | 'paid',
    value: boolean
  ) => {
    setIsProcessing(true);
    try {
      const result = await bulkSetFlag(selectedIds, action, value);
      if (result.failed > 0) {
        alert(`${t('bulk.completed')}: ${result.success}\n${t('bulk.failed')}: ${result.failed}\n${result.errors.join('\n')}`);
      } else {
        alert(`${t('bulk.success')}: ${result.success} ${t('bulk.updated')}`);
      }
      onActionComplete();
    } catch (error) {
      alert(`${t('bulk.error')}: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkPaid = () => {
    setConfirmModal({
      isOpen: true,
      title: t('bulk.confirmPaidTitle'),
      message: t('bulk.confirmPaidMessage'),
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        await handleBulkAction('paid', true);
      }
    });
  };

  // Future: bulk completed toggle - prepared but not yet used in UI
  // @ts-ignore - Function prepared for future use
  const handleBulkCompleted = () => {
    setConfirmModal({
      isOpen: true,
      title: t('bulk.confirmCompletedTitle'),
      message: t('bulk.confirmCompletedMessage'),
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        setIsProcessing(true);
        try {
          const result = await bulkSetCompleted(selectedIds);
          if (result.failed > 0) {
            alert(`${t('bulk.completed')}: ${result.success}\n${t('bulk.failed')}: ${result.failed}\n${result.errors.join('\n')}`);
          } else {
            alert(`${t('bulk.success')}: ${result.success} ${t('bulk.updated')}`);
          }
          onActionComplete();
        } catch (error) {
          alert(`${t('bulk.error')}: ${(error as Error).message}`);
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  if (selectedCount === 0) return null;

  return (
    <>
      {/* Desktop: Full bar with all buttons */}
      <div className="hidden md:block sticky top-0 bg-blue-600 text-white shadow-lg z-20 mb-4 rounded-lg">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClearSelection}
              className="p-1 hover:bg-blue-700 rounded transition-colors"
              aria-label="Clear selection"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="font-semibold">{selectedCount} {t('bulk.selected')}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkAction('sent', true)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-white text-blue-600 rounded text-sm font-medium hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.setSent')}
            </button>
            <button
              onClick={() => handleBulkAction('documents', true)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-white text-blue-600 rounded text-sm font-medium hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.setDocuments')}
            </button>
            <button
              onClick={() => handleBulkAction('handedOver', true)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-white text-blue-600 rounded text-sm font-medium hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.setHanded')}
            </button>
            <button
              onClick={handleBulkPaid}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-sm font-medium hover:bg-amber-200 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.setPaid')}
            </button>
            
            <div className="w-px h-6 bg-blue-400"></div>
            
            <button
              onClick={() => handleBulkAction('sent', false)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.clearSent')}
            </button>
            <button
              onClick={() => handleBulkAction('documents', false)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.clearDocuments')}
            </button>
            <button
              onClick={() => handleBulkAction('handedOver', false)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.clearHanded')}
            </button>
            <button
              onClick={() => handleBulkAction('paid', false)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap"
            >
              {t('bulk.clearPaid')}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: Selection bar with premium bottom sheet */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-2xl z-20 rounded-t-2xl" style={{ boxShadow: '0 -10px 25px -5px rgba(0, 0, 0, 0.3), 0 -8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClearSelection}
              className="p-1.5 hover:bg-white/20 rounded-full transition-all active:scale-95"
              aria-label="Clear selection"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold">{selectedCount}</span>
              <span className="text-sm font-medium opacity-90">{t('bulk.selected')}</span>
            </div>
          </div>

          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="px-4 py-2.5 bg-white text-blue-700 rounded-full font-semibold text-sm hover:bg-blue-50 active:scale-95 transition-all shadow-md flex items-center gap-1.5"
            disabled={isProcessing}
          >
            {t('bulk.actions')}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Premium bottom sheet */}
        {showMobileMenu && (
          <div className="fixed inset-0 z-50 flex items-end pointer-events-auto">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/40 pointer-events-auto"
              onClick={() => setShowMobileMenu(false)}
            />
            
            {/* Bottom sheet */}
            <div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-hidden animate-slide-up pointer-events-auto z-10">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{t('bulk.actionTitle')}</h3>
                  <p className="text-xs text-slate-600 mt-0">{t('bulk.forSelected')}: <span className="font-semibold">{selectedCount}</span></p>
                </div>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto">
                {/* SET section */}
                <div className="px-6 pt-3 pb-1">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('bulk.set')}</div>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => { handleBulkAction('sent', true); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-900 hover:bg-slate-50 active:bg-slate-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-blue-600 text-lg">✓</span>
                      <span className="flex-1 font-medium">{t('bulk.setSent')}</span>
                    </button>
                    <button
                      onClick={() => { handleBulkAction('documents', true); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-900 hover:bg-slate-50 active:bg-slate-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-blue-600 text-lg">✓</span>
                      <span className="flex-1 font-medium">{t('bulk.setDocuments')}</span>
                    </button>
                    <button
                      onClick={() => { handleBulkAction('handedOver', true); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-900 hover:bg-slate-50 active:bg-slate-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-blue-600 text-lg">✓</span>
                      <span className="flex-1 font-medium">{t('bulk.setHanded')}</span>
                    </button>
                    <button
                      onClick={() => { handleBulkPaid(); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-900 hover:bg-amber-50 active:bg-amber-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-amber-600 text-lg">✓</span>
                      <span className="flex-1 font-medium">{t('bulk.setPaid')}</span>
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="my-2 mx-6 border-t border-slate-200"></div>

                {/* CLEAR section */}
                <div className="px-6 pb-20">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('bulk.clear')}</div>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => { handleBulkAction('sent', false); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 active:bg-slate-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-slate-500 text-lg">✕</span>
                      <span className="flex-1">{t('bulk.clearSent')}</span>
                    </button>
                    <button
                      onClick={() => { handleBulkAction('documents', false); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 active:bg-slate-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-slate-500 text-lg">✕</span>
                      <span className="flex-1">{t('bulk.clearDocuments')}</span>
                    </button>
                    <button
                      onClick={() => { handleBulkAction('handedOver', false); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 active:bg-slate-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-slate-500 text-lg">✕</span>
                      <span className="flex-1">{t('bulk.clearHanded')}</span>
                    </button>
                    <button
                      onClick={() => { handleBulkAction('paid', false); setShowMobileMenu(false); }}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 active:bg-slate-200 rounded-xl disabled:opacity-50 transition-all duration-150"
                    >
                      <span className="text-slate-500 text-lg">✕</span>
                      <span className="flex-1">{t('bulk.clearPaid')}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
      />
    </>
  );
};
