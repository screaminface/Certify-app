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
  
  // Clear all cached data except critical settings
  const keysToPreserve = ['spi.db.initialized', 'spi.language'];
  const preservedData: Record<string, string> = {};
  
  keysToPreserve.forEach(key => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      preservedData[key] = value;
    }
  });
  
  localStorage.clear();
  
  // Restore preserved data
  Object.entries(preservedData).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
  
  // Store new version
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  
  console.log('localStorage cleared, version updated');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
