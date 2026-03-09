import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/lib/api';

export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface PreferencesContextType {
  toastPosition: ToastPosition;
  notificationsEnabled: boolean;
  isLoading: boolean;
  isSaving: boolean;
  setToastPosition: (pos: ToastPosition) => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}

const TOAST_POSITION_STORAGE_KEY = 'toastPosition';
const NOTIFICATIONS_STORAGE_KEY = 'notificationsEnabled';

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

function normalizeToastPosition(value: unknown): ToastPosition {
  switch (value) {
    case 'top-left':
    case 'top-right':
    case 'bottom-left':
    case 'bottom-right':
      return value;
    default:
      return 'bottom-right';
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [toastPosition, setToastPositionState] = useState<ToastPosition>(() => {
    if (typeof window === 'undefined') return 'bottom-right';
    return normalizeToastPosition(localStorage.getItem(TOAST_POSITION_STORAGE_KEY));
  });
  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setIsLoading(true);
    authApi
      .getPreferences()
      .then((prefs) => {
        const nextToastPosition = normalizeToastPosition(prefs.toastPosition);
        const nextNotifications = typeof prefs.notificationsEnabled === 'boolean' ? prefs.notificationsEnabled : true;
        setToastPositionState(nextToastPosition);
        setNotificationsEnabledState(nextNotifications);
        localStorage.setItem(TOAST_POSITION_STORAGE_KEY, nextToastPosition);
        localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(nextNotifications));
      })
      .catch(() => {
        // Keep local fallback
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setToastPosition = useCallback(async (pos: ToastPosition) => {
    const next = normalizeToastPosition(pos);

    setToastPositionState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOAST_POSITION_STORAGE_KEY, next);
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    setIsSaving(true);
    try {
      await authApi.updatePreferences({ toastPosition: next });
    } finally {
      setIsSaving(false);
    }
  }, []);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(enabled));
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    setIsSaving(true);
    try {
      await authApi.updatePreferences({ notificationsEnabled: enabled });
    } finally {
      setIsSaving(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      toastPosition,
      notificationsEnabled,
      isLoading,
      isSaving,
      setToastPosition,
      setNotificationsEnabled,
    }),
    [toastPosition, notificationsEnabled, isLoading, isSaving, setToastPosition, setNotificationsEnabled]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
