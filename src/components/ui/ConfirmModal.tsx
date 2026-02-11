import React, { useEffect } from 'react';
import { AlertTriangle, Info, CheckCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info'
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Auto-close after 5 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case 'danger': return <AlertTriangle className="w-6 h-6 text-red-600" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case 'success': return <CheckCircle className="w-6 h-6 text-emerald-600" />;
      default: return <Info className="w-6 h-6 text-blue-600" />;
    }
  };

  const getHeaderStyle = () => {
    switch (variant) {
      case 'danger': return 'bg-red-50 text-red-900 border-red-100';
      case 'warning': return 'bg-amber-50 text-amber-900 border-amber-100';
      case 'success': return 'bg-emerald-50 text-emerald-900 border-emerald-100';
      default: return 'bg-blue-50 text-blue-900 border-blue-100';
    }
  };

  const getConfirmBtnStyle = () => {
    switch (variant) {
      case 'danger': return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
      case 'warning': return 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500';
      case 'success': return 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500';
      default: return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-up transform transition-all">
          
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-full flex-shrink-0 ${getHeaderStyle()} bg-opacity-50`}>
                {getIcon()}
              </div>
              <div className="flex-1 pt-1">
                <h3 className="text-xl font-bold text-slate-900 mb-2 leading-none">
                  {title}
                </h3>
                <p className="text-slate-600 leading-relaxed text-sm">
                  {message}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 flex gap-3 justify-end border-t border-slate-100">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 font-medium transition-all duration-200 shadow-sm"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-5 py-2.5 text-white rounded-lg font-medium shadow-md transition-all duration-200 transform hover:-translate-y-0.5 ${getConfirmBtnStyle()}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
