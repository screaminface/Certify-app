import React, { useEffect } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  buttonText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success' | 'error';
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  buttonText = 'OK',
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
      case 'danger': 
      case 'error': return <XCircle className="w-6 h-6 text-red-600" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case 'success': return <CheckCircle className="w-6 h-6 text-emerald-600" />;
      default: return <Info className="w-6 h-6 text-blue-600" />;
    }
  };

  const getHeaderStyle = () => {
    switch (variant) {
      case 'danger': 
      case 'error': return 'bg-red-50 text-red-900 border-red-100';
      case 'warning': return 'bg-amber-50 text-amber-900 border-amber-100';
      case 'success': return 'bg-emerald-50 text-emerald-900 border-emerald-100';
      default: return 'bg-blue-50 text-blue-900 border-blue-100';
    }
  };

  const getBtnStyle = () => {
    switch (variant) {
      case 'danger': 
      case 'error': return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
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
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full md:max-w-md lg:max-w-lg overflow-hidden animate-scale-up transform transition-all">
          
          <div className="p-6 md:p-8 text-center">
            <div className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${getHeaderStyle()}`}>
              {getIcon()}
            </div>
            
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {title}
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              {message}
            </p>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100">
            <button
              onClick={onClose}
              className={`w-full px-5 py-2.5 text-white rounded-lg font-medium shadow-md transition-all duration-200 transform hover:-translate-y-0.5 ${getBtnStyle()}`}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
