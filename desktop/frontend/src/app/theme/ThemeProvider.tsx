import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ThemeMode } from '@/shared/contracts';
import { ThemeContext } from './context';
import { mirrorThemePreference, resolveDark } from './preferences';

const mediaQuery = '(prefers-color-scheme: dark)';
const getSystemDark = () => window.matchMedia(mediaQuery).matches;
const serverDark = () => false;

export function ThemeProvider({ mode: savedMode, children }: { mode: ThemeMode; children: ReactNode }) {
  const [previewMode, setPreviewMode] = useState<ThemeMode>();
  const mode = previewMode ?? savedMode;
  const subscribe = useCallback((notify: () => void) => {
    if (mode !== ThemeMode.ThemeSystem) return () => undefined;
    const query = window.matchMedia(mediaQuery);
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
  }, [mode]);
  const systemDark = useSyncExternalStore(subscribe, getSystemDark, serverDark);
  const dark = resolveDark(mode, systemDark);
  const clearPreview = useCallback(() => setPreviewMode(undefined), []);
  const value = useMemo(() => ({ mode, dark, preview: setPreviewMode, clearPreview }), [mode, dark, clearPreview]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);
  useEffect(() => { mirrorThemePreference(savedMode); }, [savedMode]);

  return <ThemeContext value={value}>
    <ConfigProvider locale={zhCN} theme={{
      algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: '#4F6BFF', borderRadius: 10, fontSize: 14,
        fontFamily: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
        colorBgLayout: dark ? '#101216' : '#F6F7FB',
      },
      components: { Menu: { itemBorderRadius: 8 }, Button: { controlHeight: 36 } },
    }}>
      <AntApp className="application-root">{children}</AntApp>
    </ConfigProvider>
  </ThemeContext>;
}
