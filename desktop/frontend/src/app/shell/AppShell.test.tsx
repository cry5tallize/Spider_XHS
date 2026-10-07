import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { BootstrapContext } from '@/app/bootstrap-context';
import { ThemeMode } from '@/shared/contracts';
import { fixtureBootstrap, fixtureAccount } from '@/test/fixtures';
import { listAccounts } from '@/features/accounts/api';
import { AppShell } from './AppShell';
import {
  maximizeWindow,
  isWindowMaximised,
  subscribeWindowState,
  closeWindow,
} from '@/shared/bridge';

vi.mock('@/shared/bridge', () => ({
  maximizeWindow: vi.fn(),
  isWindowMaximised: vi.fn(),
  subscribeWindowState: vi.fn(),
  minimizeWindow: vi.fn(),
  closeWindow: vi.fn(),
}));
vi.mock('@/features/accounts/api', () => ({ listAccounts: vi.fn() }));
beforeEach(() => {
  vi.mocked(maximizeWindow).mockResolvedValue(undefined);
  vi.mocked(isWindowMaximised).mockResolvedValue(false);
  vi.mocked(subscribeWindowState).mockReturnValue(vi.fn());
  vi.mocked(listAccounts).mockResolvedValue([fixtureAccount]);
});
function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '*', Component: AppShell }], {
    initialEntries: ['/parse'],
  });
  return render(
    <QueryClientProvider client={client}>
      <BootstrapContext value={fixtureBootstrap}>
        <ThemeProvider mode={ThemeMode.ThemeLight}>
          <RouterProvider router={router} />
        </ThemeProvider>
      </BootstrapContext>
    </QueryClientProvider>,
  );
}
describe('native titlebar commands', () => {
  it('toggles maximisation from the title text and updates the restore control', async () => {
    const view = renderShell();
    await waitFor(() => expect(isWindowMaximised).toHaveBeenCalled());
    vi.mocked(isWindowMaximised).mockResolvedValue(true);
    fireEvent.doubleClick(view.container.querySelector('.titlebar-label')!);
    await waitFor(() => expect(maximizeWindow).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: '还原' })).toBeInTheDocument();
    vi.mocked(isWindowMaximised).mockResolvedValue(false);
    fireEvent.doubleClick(view.container.querySelector('.titlebar')!);
    await waitFor(() => expect(maximizeWindow).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: '最大化' })).toBeInTheDocument();
  });
  it('ignores double clicks on window controls and side navigation controls', async () => {
    renderShell();
    fireEvent.doubleClick(screen.getByRole('button', { name: '关闭' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: '收起导航' }));
    expect(maximizeWindow).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });
  it('uses the supplied brand artwork and preserves navigation when collapsed', async () => {
    renderShell();
    expect(screen.getByRole('img', { name: 'XHS Desktop' })).toHaveAttribute(
      'src',
      expect.stringContaining('icon.webp'),
    );
    expect(screen.getByRole('link', { name: '解析笔记' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: '收起导航' }));
    expect(localStorage.getItem('xhs.sidebar.collapsed')).toBe('true');
    fireEvent.click(screen.getByRole('link', { name: '笔记库' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '笔记库' })).toHaveAttribute('aria-current', 'page'),
    );
    expect(screen.getByRole('link', { name: '解析笔记' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: '账号管理' })).toBeInTheDocument();
  });
});
