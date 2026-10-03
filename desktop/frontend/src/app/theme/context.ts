import { createContext, useContext } from 'react';
import type { ThemeMode } from '@/shared/contracts';

export interface ThemeValue {
  mode: ThemeMode;
  dark: boolean;
  preview: (mode: ThemeMode) => void;
  clearPreview: () => void;
}
export const ThemeContext = createContext<ThemeValue | null>(null);
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('Theme provider missing');
  return context;
}
