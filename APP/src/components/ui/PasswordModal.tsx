import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface PasswordModalProps {
  isOpen: boolean;
  mode: 'export' | 'import';
  onConfirm: (password: string) => void;
  onCancel: () => void;
  error?: string;
  isProcessing?: boolean;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  mode,
  onConfirm,
  onCancel,
  error,
  isProcessing = false
}) => {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4 text-slate-800">
            <div className="p-3 bg-blue-100 rounded-full">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold">
              {mode === 'export' ? t('crypto.exportTitle') : t('crypto.importTitle')}
            </h3>
          </div>
          
          <p className="text-slate-600 mb-6">
            {mode === 'export' 
              ? t('crypto.exportDescription') 
              : t('crypto.importDescription')}
          </p>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (password) onConfirm(password);
            }}
            className="space-y-4"
          >
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('crypto.passwordPlaceholder')}
                className="w-full px-4 py-3 pr-12 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                disabled={isProcessing}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 animate-pulse">
                <span>⚠️</span> {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!password || isProcessing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {isProcessing && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {mode === 'export' ? t('crypto.encryptAndExport') : t('crypto.decryptAndImport')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
