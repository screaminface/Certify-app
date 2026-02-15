import React, { useState } from 'react';
import { X, Info, Calendar, Package, Users, Activity, CheckCircle2, AlertTriangle, XCircle, HelpCircle, CalendarClock, BadgeCheck, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDisplayDate, toISODate } from '../utils/dateUtils';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  entitlement?: {
    configured: boolean;
    authenticated: boolean;
    status: 'active' | 'grace' | 'expired' | 'unknown';
    planCode: string | null;
    currentPeriodEnd: string | null;
    graceUntil: string | null;
  };
  entitlementLoading?: boolean;
  onSignOut?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, entitlement, entitlementLoading = false, onSignOut, onRefresh }) => {
  const { t, language } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  if (!isOpen) return null;

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get version from Vite environment variable
  const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
  const buildDate = import.meta.env.VITE_BUILD_DATE || toISODate(new Date());

  const formatEntitlementDate = (dateValue: string | null): string => {
    return formatDisplayDate(
      dateValue,
      language === 'bg' ? 'bg-BG' : 'en-GB',
      'Europe/Sofia',
      t('tools.notAvailable')
    );
  };

  const entitlementStatusText = (() => {
    const status = entitlement?.status ?? 'unknown';
    if (status === 'active') return t('tools.subscriptionStatusActive');
    if (status === 'grace') return t('tools.subscriptionStatusGrace');
    if (status === 'expired') return t('tools.subscriptionStatusExpired');
    return t('tools.subscriptionStatusUnknown');
  })();

  const entitlementStatusClass = (() => {
    const status = entitlement?.status ?? 'unknown';
    if (status === 'active') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (status === 'grace') return 'text-amber-800 bg-amber-50 border-amber-200';
    if (status === 'expired') return 'text-red-700 bg-red-50 border-red-200';
    return 'text-slate-700 bg-slate-50 border-slate-200';
  })();

  const StatusIcon = (() => {
    const status = entitlement?.status ?? 'unknown';
    if (status === 'active') return CheckCircle2;
    if (status === 'grace') return AlertTriangle;
    if (status === 'expired') return XCircle;
    return HelpCircle;
  })();

  const normalizedPlanCode = (() => {
    const raw = entitlement?.planCode?.trim().toLowerCase();
    if (!raw) return null;
    if (raw === 'montly' || raw === 'monthy' || raw.startsWith('mon')) return 'monthly';
    if (raw.startsWith('year')) return 'yearly';
    return raw;
  })();

  const localizedPlanText = (() => {
    if (!normalizedPlanCode) return t('tools.notAvailable');
    if (normalizedPlanCode === 'monthly') return t('tools.planMonthly');
    if (normalizedPlanCode === 'yearly') return t('tools.planYearly');
    return normalizedPlanCode;
  })();

  const endDateClass = entitlement?.status === 'expired'
    ? 'text-red-700'
    : entitlement?.status === 'grace'
      ? 'text-amber-800'
      : 'text-slate-900';

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
                <div className="text-sm text-slate-900">{formatEntitlementDate(buildDate)}</div>
              </div>
            </div>

            {entitlement?.configured && entitlement.authenticated && (
              <>
                <div className="border-t border-slate-200 pt-3">
                  <div className="text-sm font-semibold text-slate-700 mb-2">{t('tools.subscriptionAccount')}</div>
                  <div className="space-y-1.5 text-sm text-slate-700">
                    <p className="flex items-center gap-1.5">
                      <strong>{t('tools.subscriptionStatus')}:</strong>{' '}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold ${entitlementStatusClass}`}>
                        <StatusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                        {entitlementStatusText}
                      </span>
                    </p>
                    <p className={`flex items-center gap-1.5 ${endDateClass}`}>
                      <CalendarClock className="w-4 h-4" strokeWidth={2} />
                      <span><strong>{t('tools.subscriptionEndsAt')}:</strong> {formatEntitlementDate(entitlement.currentPeriodEnd)}</span>
                    </p>
                    {entitlement.status === 'grace' && (
                      <p className="text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                        <span><strong>{t('tools.graceUntil')}:</strong> {formatEntitlementDate(entitlement.graceUntil)}</span>
                      </p>
                    )}
                    <p className="flex items-center gap-1.5">
                      <BadgeCheck className="w-4 h-4 text-slate-500" strokeWidth={2} />
                      <span><strong>{t('tools.subscriptionPlan')}:</strong> {localizedPlanText}</span>
                    </p>
                    {entitlementLoading && <p className="text-slate-500">{t('common.loading')}</p>}
                  </div>
                </div>
              </>
            )}
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
        <div className="mt-6 flex gap-3">
          {entitlement?.configured && entitlement.authenticated && (
            <button
              onClick={() => void onSignOut?.()}
              className="px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium transition-colors"
            >
              {t('auth.signOut')}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
