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
    { path: 'parse', lazy: () => import('@/features/notes/parse-route') },
    { path: 'parse/collections/:id', lazy: () => import('@/features/parsing/result-route') },
    { path: 'notes', lazy: () => import('@/features/notes/library-route') },
    { path: 'notes/:id', lazy: () => import('@/features/notes/detail-route') },
    { path: 'downloads', lazy: () => import('@/features/downloads/route') },
    { path: 'history', lazy: () => import('@/features/history/route') },
  ],
}]);
