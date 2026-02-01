import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Theme, themes } from '../lib/theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  // Apply CSS variables to document root
  const applyTheme = useCallback((t: Theme) => {
    const tokens = themes[t];
    const root = document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
  }, []);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    const initial = stored === 'light' ? 'light' : 'dark';
    setTheme(initial);
    applyTheme(initial);
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      applyTheme(next);
      return next;
    });
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
