import { createHashRouter } from 'react-router';
import { AppShell } from './shell/AppShell';
import { RouteErrorBoundary } from './RouteErrorBoundary';

export const router = createHashRouter([{
  Component: AppShell,
  ErrorBoundary: RouteErrorBoundary,
  children: [
    { index: true, lazy: () => import('./welcome/route') },
    { path: 'settings', lazy: () => import('@/features/settings/route') },
    { path: 'accounts', lazy: () => import('@/features/accounts/route') },
  ],
}]);
