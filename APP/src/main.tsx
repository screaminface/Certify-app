import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary';

// Clear localStorage on version change to prevent stale cache issues
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2.1.0';
const VERSION_KEY = 'spi.app.version';

const storedVersion = localStorage.getItem(VERSION_KEY);
if (storedVersion !== APP_VERSION) {
  console.log(`Version changed from '${storedVersion}' to '${APP_VERSION}', clearing localStorage`);
  
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
