import { ThemeMode } from '@/shared/contracts';

const preferenceKey = 'xhs-desktop.theme';
export function readThemePreference(): ThemeMode {
  try {
    const mode = Number(localStorage.getItem(preferenceKey));
    if ([ThemeMode.ThemeSystem, ThemeMode.ThemeLight, ThemeMode.ThemeDark].includes(mode)) return mode;
  } catch { /* A restricted WebView can deny local storage. SQLite remains authoritative. */ }
  return ThemeMode.ThemeSystem;
}
export function mirrorThemePreference(mode: ThemeMode) {
  try {
    localStorage.setItem(preferenceKey, String(mode));
    // A CSS hint for the inline first paint, not another application enum.
    localStorage.setItem('xhs-desktop.startup-color-scheme', mode === ThemeMode.ThemeDark ? 'dark' : mode === ThemeMode.ThemeLight ? 'light' : 'auto');
  } catch { /* Optional startup mirror. */ }
}
export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === ThemeMode.ThemeDark || (mode === ThemeMode.ThemeSystem && systemDark);
}
