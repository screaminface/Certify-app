import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LockScreen } from './LockScreen';
import { isPinSet, clearPinConfig } from '../../security/pinLock';
import { db } from '../../db/database';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface AppLockGateProps {
  children: React.ReactNode;
}

export const AppLockGate: React.FC<AppLockGateProps> = ({ children }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [isReady, setIsReady] = useState(false); // Wait for initial check
  const activityTimerRef = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initial Check
  useEffect(() => {
    const hasPin = isPinSet();
    if (hasPin) {
      setIsLocked(true);
    }
    setIsReady(true);
  }, []);

  // Lock Function
  const lockApp = useCallback(() => {
    if (isPinSet()) {
      setIsLocked(true);
    }
  }, []);

  // Unlock Function
  const unlockApp = useCallback(() => {
    setIsLocked(false);
    activityTimerRef.current = Date.now();
  }, []);

  // Activity Tracker
  useEffect(() => {
    if (isLocked) return;

    const resetTimer = () => {
      activityTimerRef.current = Date.now();
    };

    // Events to track activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    
    // Throttled handler to avoid perf hit
    let throttleTimeout: NodeJS.Timeout | null = null;
    const handleActivity = () => {
      if (!throttleTimeout) {
        resetTimer();
        throttleTimeout = setTimeout(() => {
            throttleTimeout = null;
        }, 1000);
      }
    };

    events.forEach(event => window.addEventListener(event, handleActivity));

    // Visibility Change Handling (Lock if returning after timeout)
    const handleVisibilityChange = () => {
        if (!document.hidden && isPinSet()) {
            const idleTime = Date.now() - activityTimerRef.current;
            if (idleTime > IDLE_TIMEOUT_MS) {
                setIsLocked(true);
            }
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic Check Interval
    intervalRef.current = setInterval(() => {
        if (document.hidden) return; // Don't aggressive lock if hidden, rely on visibility change or next wake
        const idleTime = Date.now() - activityTimerRef.current;
        if (idleTime > IDLE_TIMEOUT_MS && isPinSet()) {
            setIsLocked(true);
        }
    }, 5000); // Check every 5s

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [isLocked]);

  // Expose manual lock via Custom Event (simple global bus for the menu)
  useEffect(() => {
    const handleManualLock = () => lockApp();
    window.addEventListener('app-lock-manual', handleManualLock);
    return () => window.removeEventListener('app-lock-manual', handleManualLock);
  }, [lockApp]);

  // Handle Data Wipe
  const handleResetData = async () => {
    try {
        await db.delete(); // Delete the whole DB
        await db.open(); // Re-open clean
        clearPinConfig(); // Ensure PIN is gone
        window.location.reload(); // Hard reload
    } catch (e) {
        console.error('Failed to reset data', e);
        alert('Failed to reset data. Please clear browser storage manually.');
    }
  };

  if (!isReady) return null; // Or a loading spinner

  if (isLocked) {
    return (
      <LockScreen 
        mode="unlock" 
        onSuccess={unlockApp} 
        onResetData={handleResetData}
      />
    );
  }

  return <>{children}</>;
};

// Helper to trigger manual lock from anywhere
export const triggerManualLock = () => {
    window.dispatchEvent(new Event('app-lock-manual'));
};
