import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { Profile, ThemeMode, type Bootstrap } from '@/shared/contracts';
import { RuntimeState } from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/dto/models';
import { BootstrapContext, bootstrapKey } from '@/app/bootstrap-context';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { Component } from './route';
import { chooseOutputDirectory, updateGeneral } from './api';

vi.mock('./api', () => ({ chooseOutputDirectory: vi.fn(), updateGeneral: vi.fn() }));

const bootstrap: Bootstrap = {
  name: 'XHS Desktop', version: '0.1.0', profile: Profile.Development, state: RuntimeState.StateReady,
  data_directory: 'D:\\data', schema_version: 1,
  settings: { schema_version: 1, theme_mode: ThemeMode.ThemeSystem, max_concurrent_notes: 4, output_directory: '', revision: 1, updated_at_ms: 1_791_024_000_987 },
};

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(bootstrapKey, bootstrap);
  render(<QueryClientProvider client={client}><BootstrapContext value={bootstrap}>
    <ThemeProvider mode={bootstrap.settings.theme_mode}><Component /></ThemeProvider>
  </BootstrapContext></QueryClientProvider>);
  return client;
}

describe('settings commands', () => {
  it('saves generated numeric modes and the expected revision', async () => {
    const saved = { ...bootstrap.settings, theme_mode: ThemeMode.ThemeDark, revision: 2 };
    vi.mocked(updateGeneral).mockResolvedValue(saved);
    const client = renderSettings();
    fireEvent.click(screen.getByText('深色'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: '保存偏好' }));
    await waitFor(() => expect(updateGeneral).toHaveBeenCalledWith({
      theme_mode: ThemeMode.ThemeDark, max_concurrent_notes: 4, output_directory: '', expected_revision: 1,
    }));
    await waitFor(() => expect(client.getQueryData<Bootstrap>(bootstrapKey)?.settings.revision).toBe(2));
  });
  it('keeps the output path when the native chooser is canceled', async () => {
    vi.mocked(chooseOutputDirectory).mockResolvedValueOnce('D:\\Downloads').mockResolvedValueOnce('');
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '选择下载目录' }));
    await waitFor(() => expect(screen.getByPlaceholderText('例如 D:\\Downloads\\XHS')).toHaveValue('D:\\Downloads'));
    fireEvent.click(screen.getByRole('button', { name: '选择下载目录' }));
    await waitFor(() => expect(chooseOutputDirectory).toHaveBeenCalledTimes(2));
    expect(screen.getByPlaceholderText('例如 D:\\Downloads\\XHS')).toHaveValue('D:\\Downloads');
  });
});
