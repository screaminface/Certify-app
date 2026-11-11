import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Delete } from 'lucide-react';
import { hashPin, verifyPin, getPinConfig, savePinConfig, clearPinConfig } from '../../security/pinLock';
import { useLanguage } from '../../contexts/LanguageContext';
import { ModalShell } from '../ui/ModalShell';

interface LockScreenProps {
  mode: 'unlock' | 'setup' | 'disable';
  onSuccess: () => void;
  onCancel?: () => void; // Used for setup/disable modes if user backs out
  onResetData?: () => void; // For "Forgot PIN" scenario
}

export const LockScreen: React.FC<LockScreenProps> = ({ mode, onSuccess, onCancel, onResetData }) => {
  const { t } = useLanguage();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter'); // 'enter' = first 4 digits, 'confirm' = repeat (for setup)
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotConfirmText, setForgotConfirmText] = useState('');
  const closeForgotModal = () => { setShowForgotModal(false); setForgotConfirmText(''); };

  // Auto-focus logic or simple numpad interaction
  useEffect(() => {
    // Reset state when mode changes
    setPin('');
    setConfirmPin('');
    setStep('enter');
    setError(null);
  }, [mode]);

  const handleDigit = (digit: number) => {
    if (isProcessing) return;
    setError(null);

    const currentStr = step === 'enter' ? pin : confirmPin;
    if (currentStr.length < 4) {
      const newVal = currentStr + digit.toString();
      if (step === 'enter') setPin(newVal);
      else setConfirmPin(newVal);

      // Auto-submit on 4th digit
      if (newVal.length === 4) {
        handleComplete(newVal);
      }
    }
  };

  const handleBackspace = () => {
    if (isProcessing) return;
    setError(null);
    if (step === 'enter') {
      setPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  };

  const handleComplete = async (finalPin: string) => {
    setIsProcessing(true);
    
    // Slight delay for UX
    await new Promise(r => setTimeout(r, 100));

    try {
      if (mode === 'unlock') {
        const config = getPinConfig();
        if (!config) {
          // Should not happen in unlock mode if configured right, but safeguard
          onSuccess(); 
          return;
        }
        const isValid = await verifyPin(finalPin, config);
        if (isValid) {
          onSuccess();
        } else {
          setError(t('security.incorrectPin'));
          setPin('');
        }
      } 
      else if (mode === 'setup') {
        if (step === 'enter') {
          // Move to confirmation
          setStep('confirm');
          setIsProcessing(false); // Stop processing, wait for confirmation
          return; // Don't reset anything yet
        } else {
          // Verify match
          if (finalPin === pin) {
            // Save
            const { hash, salt } = await hashPin(finalPin);
            savePinConfig({
              version: 1,
              hash,
              salt,
              algo: 'PBKDF2-SHA-256',
              createdAt: new Date().toISOString()
            });
            onSuccess();
          } else {
            setError(t('security.pinMismatch'));
            setPin('');
            setConfirmPin('');
            setStep('enter');
          }
        }
      }
      else if (mode === 'disable') {
        // Verify before disabling
        const config = getPinConfig();
        if (config && await verifyPin(finalPin, config)) {
            clearPinConfig();
            onSuccess();
        } else {
            setError(t('security.incorrectPin'));
            setPin('');
        }
      }
    } catch (err) {
      console.error(err);
      setError(t('security.error'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Numpad Render
  const renderNumpad = () => (
    <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto mt-8">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
        <button
          key={num}
          onClick={() => handleDigit(num)}
          className="w-16 h-16 rounded-full bg-slate-100 text-slate-700 text-2xl font-bold hover:bg-slate-200 active:bg-slate-300 transition-colors flex items-center justify-center shadow-sm"
        >
          {num}
        </button>
      ))}
      <div className="w-16 h-16 flex items-center justify-center">
       {/* Empty spacer or Forgot PIN for Unlock mode? */}
       {mode === 'unlock' && (
           <button 
             onClick={() => setShowForgotModal(true)}
             className="text-xs text-slate-400 font-medium hover:text-red-500 transition-colors"
           >
             {t('security.forgot')}
           </button>
       )}
      </div>
      <button
        onClick={() => handleDigit(0)}
        className="w-16 h-16 rounded-full bg-slate-100 text-slate-700 text-2xl font-bold hover:bg-slate-200 active:bg-slate-300 transition-colors flex items-center justify-center shadow-sm"
      >
        0
      </button>
      <button
        onClick={handleBackspace}
        className="w-16 h-16 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors flex items-center justify-center"
      >
        <Delete className="w-6 h-6" />
      </button>
    </div>
  );

  // Dot Display
  const renderDots = (value: string) => (
    <div className="flex gap-4 justify-center mb-6">
      {[0, 1, 2, 3].map(i => (
        <div 
            key={i} 
            className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                i < value.length 
                ? 'bg-blue-600 border-blue-600' 
                : 'bg-transparent border-slate-300'
            } ${error ? 'border-red-400 bg-red-50' : ''}`}
        />
      ))}
    </div>
  );

  const getTitle = () => {
      if (mode === 'setup') return step === 'enter' ? t('security.setPinTitle') : t('security.confirmPinTitle');
      if (mode === 'disable') return t('security.enterPinToDisable');
      return t('security.appLocked');
  };

  const getSubtitle = () => {
      if (error) return error;
      if (mode === 'setup') return step === 'enter' ? t('security.enter4DigitPin') : t('security.reEnterToConfirm');
      return t('security.enterYourPin');
  };

  return (
    // Shell traps Tab inside the lock screen (nothing behind it must be
    // reachable). Esc backs out only where a cancel path exists (setup/disable).
    <ModalShell onClose={onCancel}>
    <div className="fixed inset-0 bg-slate-50 z-[100] flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <div className={`p-4 rounded-full ${error ? 'bg-red-100' : 'bg-blue-100'}`}>
            {mode === 'unlock' ? <Lock className={`w-8 h-8 ${error ? 'text-red-600' : 'text-blue-600'}`} /> : <ShieldCheck className="w-8 h-8 text-blue-600" />}
          </div>
        </div>
        
        <h2 className={`text-2xl font-bold mb-2 ${error ? 'text-red-600' : 'text-slate-800'}`}>
          {getTitle()}
        </h2>
        
        <p className={`text-sm mb-8 font-medium ${error ? 'text-red-500' : 'text-slate-500'}`}>
           {getSubtitle()}
        </p>

        {renderDots(step === 'enter' ? pin : confirmPin)}
        
        {renderNumpad()}

        {onCancel && (
            <button 
                onClick={onCancel}
                className="mt-8 text-slate-500 hover:text-slate-700 font-medium text-sm"
            >
                {t('common.cancel')}
            </button>
        )}
      </div>

      {/* Forgot PIN = full data wipe. Anyone holding a locked device can reach
          this, so it MUST NOT be a two-tap action: require typing ИЗТРИЙ. */}
      {showForgotModal && (
        <ModalShell onClose={closeForgotModal}>
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeForgotModal}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="forgot-pin-title"
            aria-describedby="forgot-pin-message"
            className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-left"
          >
            <h3 id="forgot-pin-title" className="text-lg font-bold text-red-600 mb-2">{t('security.resetDataTitle')}</h3>
            <p id="forgot-pin-message" className="text-sm text-slate-700 mb-3">{t('security.resetDataMessage')}</p>
            <label htmlFor="forgot-pin-confirm" className="block text-sm text-slate-700 mb-2 font-medium">
              {t('security.resetTypeToConfirm')}: <code className="bg-slate-100 px-2 py-0.5 rounded font-bold">ИЗТРИЙ</code>
            </label>
            <input
              id="forgot-pin-confirm"
              type="text"
              value={forgotConfirmText}
              onChange={(e) => setForgotConfirmText(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeForgotModal}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={forgotConfirmText.trim().toUpperCase() !== 'ИЗТРИЙ'}
                onClick={() => {
                  if (onResetData) {
                    clearPinConfig();
                    onResetData();
                  }
                  closeForgotModal();
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('security.resetDataConfirm')}
              </button>
            </div>
          </div>
        </div>
        </ModalShell>
      )}
    </div>
    </ModalShell>
  );
};
