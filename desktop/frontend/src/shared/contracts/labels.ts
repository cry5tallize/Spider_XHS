import { ThemeMode } from './index';

export const themeModeLabels: Record<ThemeMode, string> = {
  [ThemeMode.ThemeUnknown]: '未知',
  [ThemeMode.ThemeSystem]: '跟随系统',
  [ThemeMode.ThemeLight]: '浅色',
  [ThemeMode.ThemeDark]: '深色',
};
