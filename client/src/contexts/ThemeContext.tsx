import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { authApi } from '@/lib/api';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as Theme;
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    
    if (token) {
      authApi.getPreferences()
        .then((prefs) => {
          if (prefs.theme) {
            setThemeState(prefs.theme);
            localStorage.setItem('theme', prefs.theme);
          }
        })
        .catch(() => {
        });
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const syncWithServer = useCallback(async (newTheme: Theme) => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoading(true);
      try {
        await authApi.updatePreferences({ theme: newTheme });
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setThemeState(newTheme);
    syncWithServer(newTheme);
  }, [theme, syncWithServer]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    syncWithServer(newTheme);
  }, [syncWithServer]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
