import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary';

// Build-time flag: true when built with CAPACITOR_PLATFORM env var (build-android.ps1)
const IS_CAPACITOR: boolean = import.meta.env.VITE_IS_CAPACITOR === true;

// Clear localStorage on version change to prevent stale cache issues
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2.1.0';
const VERSION_KEY = 'spi.app.version';

const storedVersion = localStorage.getItem(VERSION_KEY);
if (storedVersion !== APP_VERSION) {
  // Browser/PWA only: unregister old service workers and reload to pick up new SW bundle.
  // On Capacitor Android: NEVER reload — the WebView has no SW and reload causes white screen.
  if (!IS_CAPACITOR && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      Promise.all(regs.map(r => r.unregister())).then(() => window.location.reload());
    });
  }
  
  // Clear stale leftovers, but keep everything the user would notice losing.
  // (Before 3.0.0 only language survived: every update silently turned the
  // PIN lock off and logged the user out — re-login needs internet.)
  const PRESERVE_KEYS = new Set([
    'spi.db.initialized',
    'spi.language',
    'app_pin_config',             // PIN lock (security/pinLock.ts)
    'spi.entitlement.cache.v1',   // subscription cache for offline start (EntitlementContext)
    'groups-collapsed-active',    // dashboard section state (useGroupSections)
    'groups-collapsed-planned',
    'groups-collapsed-completed'
  ]);
  // Supabase login session: sb-<project>-auth-token (+ PKCE code-verifier)
  const isPreserved = (key: string) => PRESERVE_KEYS.has(key) || /^sb-.+-auth-token/.test(key);

  const staleKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && !isPreserved(key)) staleKeys.push(key);
  }
  staleKeys.forEach(key => localStorage.removeItem(key));

  // Store new version
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  
  console.log(`localStorage: ${staleKeys.length} stale key(s) cleared, version updated`);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
