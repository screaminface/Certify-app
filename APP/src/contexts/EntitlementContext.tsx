import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { setAppReadOnlyMode } from '../db/database';

type EntitlementStatus = 'active' | 'grace' | 'expired' | 'unknown';

interface EntitlementState {
  configured: boolean;
  authenticated: boolean;
  status: EntitlementStatus;
  readOnly: boolean;
  planCode: string | null;
  daysUntilReadOnly: number | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  error: string | null;
  lastCheckedAt: string | null;
}

interface EntitlementContextType {
  entitlement: EntitlementState;
  loading: boolean;
  recoveryMode: boolean;
  authLinkError: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  clearAuthLinkError: () => void;
}

const CACHE_KEY = 'spi.entitlement.cache.v1';

const defaultState: EntitlementState = {
  configured: false,
  authenticated: false,
  status: 'unknown',
  readOnly: false,
  planCode: null,
  daysUntilReadOnly: null,
  currentPeriodEnd: null,
  graceUntil: null,
  error: null,
  lastCheckedAt: null
};

const EntitlementContext = createContext<EntitlementContextType | undefined>(undefined);

function getReadableErrorMessage(err: unknown): string {
  if (!err) return 'Entitlement check failed.';

  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'object' && err !== null) {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }
  }

  return 'Entitlement check failed.';
}

function loadCachedEntitlement(): EntitlementState {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as EntitlementState;
    return {
      ...defaultState,
      ...parsed,
      error: null
    };
  } catch {
    return defaultState;
  }
}

function persistEntitlement(state: EntitlementState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));
}

export const EntitlementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [entitlement, setEntitlement] = useState<EntitlementState>(() => loadCachedEntitlement());
  const [loading, setLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [authLinkError, setAuthLinkError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) {
      return;
    }

    const params = new URLSearchParams(hash.slice(1));
    const errorDescription = params.get('error_description');
    if (errorDescription) {
      setAuthLinkError(errorDescription.replace(/\+/g, ' '));
    }

    const type = params.get('type');
    const hasRecoveryToken = Boolean(params.get('access_token') || params.get('code'));
    if (type === 'recovery' && hasRecoveryToken) {
      setRecoveryMode(true);
      setAuthLinkError(null);
    }
  }, []);

  useEffect(() => {
    setAppReadOnlyMode(entitlement.readOnly);
  }, [entitlement.readOnly]);

  const refresh = useCallback(async (silent: boolean = false) => {
    if (!supabase) {
      const nextState: EntitlementState = {
        ...defaultState,
        configured: false,
        readOnly: false,
        lastCheckedAt: new Date().toISOString()
      };
      setEntitlement(nextState);
      persistEntitlement(nextState);
      setAppReadOnlyMode(false);
      return;
    }

    // Only show loading indicator for explicit user actions (not background refresh)
    if (!silent) {
      setLoading(true);
    }
    
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      if (!sessionData.session) {
        const nextState: EntitlementState = {
          ...defaultState,
          configured: true,
          authenticated: false,
          readOnly: false,
          lastCheckedAt: new Date().toISOString()
        };
        setEntitlement(nextState);
        persistEntitlement(nextState);
        setAppReadOnlyMode(false);
        return;
      }

      const { data, error } = await supabase.rpc('entitlement_me', { p_tenant_id: null });
      if (error) {
        throw error;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        throw new Error('Entitlement data is missing.');
      }

      const nextState: EntitlementState = {
        configured: true,
        authenticated: true,
        status: (row.status as EntitlementStatus) || 'unknown',
        readOnly: Boolean(row.read_only),
        planCode: row.plan_code || null,
        daysUntilReadOnly: typeof row.days_until_read_only === 'number' ? row.days_until_read_only : null,
        currentPeriodEnd: row.current_period_end || null,
        graceUntil: row.grace_until || null,
        error: null,
        lastCheckedAt: new Date().toISOString()
      };

      setEntitlement(nextState);
      persistEntitlement(nextState);
      setAppReadOnlyMode(nextState.readOnly);
    } catch (err) {
      const message = getReadableErrorMessage(err);
      const lower = message.toLowerCase();

      if (
        lower.includes('jwt') ||
        lower.includes('refresh token') ||
        lower.includes('session') ||
        lower.includes('invalid token')
      ) {
        await supabase.auth.signOut();
        const nextState: EntitlementState = {
          ...defaultState,
          configured: true,
          authenticated: false,
          readOnly: false,
          error: null,
          lastCheckedAt: new Date().toISOString()
        };
        setEntitlement(nextState);
        persistEntitlement(nextState);
        setAppReadOnlyMode(false);
        return;
      }

      // Only update error state if not silent (to avoid disrupting user during background refresh)
      if (!silent) {
        setEntitlement(prev => ({
          ...prev,
          configured: true,
          error: message,
          lastCheckedAt: new Date().toISOString()
        }));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [supabase]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }

    await refresh();
  }, [refresh, supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }

    await refresh();
  }, [refresh, supabase]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const basePath = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : `${window.location.pathname}/`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${basePath}`
    });

    if (error) {
      throw error;
    }
  }, [supabase]);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw error;
    }

    setRecoveryMode(false);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    await refresh();
  }, [refresh, supabase]);

  const clearAuthLinkError = useCallback(() => {
    setAuthLinkError(null);
    if (window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let lastRefreshTimeMs = 0;

    const safeRefresh = async (silent: boolean = false) => {
      if (!isMounted) return;
      await refresh(silent);
      lastRefreshTimeMs = Date.now();
    };

    // Initial refresh (visible)
    safeRefresh(false);

    // Background refresh every 2 minutes (silent, won't disrupt UI)
    const interval = window.setInterval(() => {
      void safeRefresh(true);
    }, 2 * 60 * 1000);

    // Refresh when window gets focus (user returns to app after making changes in Supabase, etc.)
    // Rate limit: only if last refresh was more than 10 seconds ago
    const handleWindowFocus = () => {
      const timeSinceLastRefresh = Date.now() - lastRefreshTimeMs;
      if (timeSinceLastRefresh > 10_000) {
        void safeRefresh(true);
      }
    };

    window.addEventListener('focus', handleWindowFocus);

    const {
      data: { subscription }
    } = supabase
      ? supabase.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') {
            setRecoveryMode(true);
            setAuthLinkError(null);
          }
          if (event === 'SIGNED_OUT') {
            setRecoveryMode(false);
          }
          // Auth state changes should trigger visible refresh
          void safeRefresh(false);
        })
      : { data: { subscription: { unsubscribe: () => undefined } } };

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleWindowFocus);
      subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  return (
    <EntitlementContext.Provider
      value={{
        entitlement,
        loading,
        recoveryMode,
        authLinkError,
        refresh,
        signInWithPassword,
        signOut,
        requestPasswordReset,
        updatePassword,
        clearAuthLinkError
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
};

export const useEntitlement = () => {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error('useEntitlement must be used within EntitlementProvider');
  }
  return context;
};
