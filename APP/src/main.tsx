import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary';

// Detect if running as a native Capacitor app (Android/iOS)
const isNative = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.();

// Unregister old Service Workers to prevent cache issues (PWA/browser only)
async function unregisterServiceWorkers() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
  }
}

// Clear localStorage on version change to prevent stale cache issues
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2.1.0';
const VERSION_KEY = 'spi.app.version';

const storedVersion = localStorage.getItem(VERSION_KEY);
if (storedVersion !== APP_VERSION) {
  // In native Capacitor app: just clear caches silently, NO reload (causes white screen)
  // In browser/PWA: unregister service workers and reload to pick up new bundle
  if (!isNative) {
    unregisterServiceWorkers().then(() => {
      window.location.reload();
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
