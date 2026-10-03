import { useEffect } from 'react';
import { Button, Result, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { getBootstrap, setWindowAppearance } from '@/shared/bridge';
import { BootstrapContext, bootstrapKey } from './bootstrap-context';
import { ThemeProvider } from './theme/ThemeProvider';
import { readThemePreference } from './theme/preferences';
import { useTheme } from './theme/context';
import { router } from './router';

function NativeAppearance() {
  const { dark } = useTheme();
  useEffect(() => { void setWindowAppearance(dark).catch(console.error); }, [dark]);
  return null;
}

export function BootstrapApplication() {
  const bootstrap = useQuery({ queryKey: bootstrapKey, queryFn: ({ signal }) => getBootstrap(signal), retry: false });
  const savedMode = bootstrap.data?.settings.theme_mode ?? readThemePreference();
  return <ThemeProvider mode={savedMode}>
    {bootstrap.isPending ? <div className="startup-screen"><Spin description="正在打开工作空间" /></div>
      : bootstrap.isError ? <Result status="error" title="无法读取本地数据"
        subTitle={bootstrap.error instanceof Error ? bootstrap.error.message : '请重试或重新打开应用。'}
        extra={<Button type="primary" onClick={() => void bootstrap.refetch()}>重试</Button>} />
      : <BootstrapContext value={bootstrap.data}>
        <NativeAppearance />
        <RouterProvider router={router} />
      </BootstrapContext>}
  </ThemeProvider>;
}
