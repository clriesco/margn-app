export type Theme = 'dark' | 'light';

export interface ThemeTokens {
  '--bg-body': string;
  '--bg-card': string;
  '--bg-sidebar': string;
  '--bg-glass': string;
  '--bg-glass-strong': string;
  '--border': string;
  '--border-light': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--text-muted': string;
  '--text-dim': string;
  '--text-on-glass': string;
  '--text-on-glass-muted': string;
  '--input-bg': string;
  '--input-border': string;
  '--input-color': string;
  '--hover-bg': string;
  '--accent-blue': string;
  '--accent-blue-light': string;
  '--accent-green': string;
  '--accent-red': string;
  '--accent-yellow': string;
  '--accent-purple': string;
  '--shadow-overlay': string;
  '--disabled-bg': string;
  '--disabled-color': string;
  '--disabled-border': string;
}

export const darkTheme: ThemeTokens = {
  '--bg-body': '#0a0e27',
  '--bg-card': '#131b2e',
  '--bg-sidebar': '#0f172a',
  '--bg-glass': 'rgba(255, 255, 255, 0.1)',
  '--bg-glass-strong': 'rgba(255, 255, 255, 0.15)',
  '--border': '#1e293b',
  '--border-light': '#334155',
  '--text-primary': '#f1f5f9',
  '--text-secondary': '#cbd5e1',
  '--text-muted': '#94a3b8',
  '--text-dim': '#64748b',
  '--text-on-glass': 'rgba(255, 255, 255, 0.9)',
  '--text-on-glass-muted': 'rgba(255, 255, 255, 0.6)',
  '--input-bg': '#0a0e27',
  '--input-border': '#334155',
  '--input-color': 'white',
  '--hover-bg': 'rgba(255, 255, 255, 0.05)',
  '--accent-blue': '#3b82f6',
  '--accent-blue-light': '#60a5fa',
  '--accent-green': '#34d399',
  '--accent-red': '#ef4444',
  '--accent-yellow': '#fbbf24',
  '--accent-purple': '#c084fc',
  '--shadow-overlay': 'rgba(0, 0, 0, 0.5)',
  '--disabled-bg': 'rgba(255, 255, 255, 0.1)',
  '--disabled-color': 'rgba(255, 255, 255, 0.5)',
  '--disabled-border': 'rgba(255, 255, 255, 0.1)',
};

export const lightTheme: ThemeTokens = {
  '--bg-body': '#f8fafc',
  '--bg-card': '#ffffff',
  '--bg-sidebar': '#f1f5f9',
  '--bg-glass': 'rgba(0, 0, 0, 0.04)',
  '--bg-glass-strong': 'rgba(0, 0, 0, 0.06)',
  '--border': '#e2e8f0',
  '--border-light': '#d1d5db',
  '--text-primary': '#1e293b',
  '--text-secondary': '#475569',
  '--text-muted': '#64748b',
  '--text-dim': '#94a3b8',
  '--text-on-glass': '#334155',
  '--text-on-glass-muted': '#64748b',
  '--input-bg': '#f8fafc',
  '--input-border': '#d1d5db',
  '--input-color': '#1e293b',
  '--hover-bg': 'rgba(0, 0, 0, 0.04)',
  '--accent-blue': '#2563eb',
  '--accent-blue-light': '#3b82f6',
  '--accent-green': '#16a34a',
  '--accent-red': '#dc2626',
  '--accent-yellow': '#d97706',
  '--accent-purple': '#7c3aed',
  '--shadow-overlay': 'rgba(0, 0, 0, 0.2)',
  '--disabled-bg': 'rgba(0, 0, 0, 0.05)',
  '--disabled-color': 'rgba(0, 0, 0, 0.35)',
  '--disabled-border': 'rgba(0, 0, 0, 0.1)',
};

export const themes: Record<Theme, ThemeTokens> = {
  dark: darkTheme,
  light: lightTheme,
};
