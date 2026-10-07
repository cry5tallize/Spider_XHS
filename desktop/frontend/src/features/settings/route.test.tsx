import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { Profile, ThemeMode, type Bootstrap, type General } from '@/shared/contracts';
import { RuntimeState } from '../../../bindings/github.com/cry5tallize/xhs_spider_desktop/internal/bridge/dto/models';
import { BootstrapContext, bootstrapKey } from '@/app/bootstrap-context';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { Component } from './route';
import { chooseOutputDirectory, updateGeneral } from './api';

vi.mock('./api', () => ({ chooseOutputDirectory: vi.fn(), updateGeneral: vi.fn() }));

const bootstrap: Bootstrap = {
  name: 'XHS Desktop',
  version: '0.1.0',
  profile: Profile.Development,
  state: RuntimeState.StateReady,
  data_directory: 'D:\\data',
  default_download_directory: 'D:\\data\\downloads',
  schema_version: 1,
  settings: {
    schema_version: 1,
    theme_mode: ThemeMode.ThemeSystem,
    max_concurrent_notes: 4,
    output_directory: '',
    revision: 1,
    updated_at_ms: 1_791_024_000_987,
  },
};

function renderSettings(overrides: Partial<General> = {}) {
  const configured = { ...bootstrap, settings: { ...bootstrap.settings, ...overrides } };
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(bootstrapKey, configured);
  render(
    <QueryClientProvider client={client}>
      <BootstrapContext value={configured}>
        <ThemeProvider mode={configured.settings.theme_mode}>
          <Component />
        </ThemeProvider>
      </BootstrapContext>
    </QueryClientProvider>,
  );
  return client;
}

describe('settings commands', () => {
  it('saves generated numeric modes and the expected revision', async () => {
    const saved = { ...bootstrap.settings, theme_mode: ThemeMode.ThemeDark, revision: 2 };
    vi.mocked(updateGeneral).mockResolvedValue(saved);
    const client = renderSettings();
    fireEvent.click(screen.getByText('深色'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(await screen.findByRole('button', { name: '保存偏好' }));
    await waitFor(() =>
      expect(updateGeneral).toHaveBeenCalledWith({
        theme_mode: ThemeMode.ThemeDark,
        max_concurrent_notes: 4,
        output_directory: '',
        expected_revision: 1,
      }),
    );
    await waitFor(() =>
      expect(client.getQueryData<Bootstrap>(bootstrapKey)?.settings.revision).toBe(2),
    );
  });
  it('keeps the output path when the native chooser is canceled', async () => {
    vi.mocked(chooseOutputDirectory)
      .mockResolvedValueOnce('D:\\Downloads')
      .mockResolvedValueOnce('');
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '选择下载目录' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '默认下载目录' })).toHaveValue('D:\\Downloads'),
    );
    fireEvent.click(screen.getByRole('button', { name: '选择下载目录' }));
    await waitFor(() => expect(chooseOutputDirectory).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('textbox', { name: '默认下载目录' })).toHaveValue('D:\\Downloads');
  });
  it('restores the executable data download default without saving an absolute override', async () => {
    vi.mocked(updateGeneral)
      .mockClear()
      .mockResolvedValue({ ...bootstrap.settings, revision: 2 });
    renderSettings({ output_directory: 'D:\\Custom' });
    const directory = screen.getByRole('textbox', { name: '默认下载目录' });
    expect(directory).toHaveAttribute('placeholder', 'D:\\data\\downloads');
    fireEvent.change(directory, { target: { value: 'D:\\Custom' } });
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    expect(directory).toHaveValue('');
    fireEvent.click(await screen.findByRole('button', { name: '保存偏好' }));
    await waitFor(() =>
      expect(updateGeneral).toHaveBeenCalledWith({
        theme_mode: ThemeMode.ThemeSystem,
        max_concurrent_notes: 4,
        output_directory: '',
        expected_revision: 1,
      }),
    );
  });
  it('undoes unsaved preferences and the theme preview', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('radio', { name: /深色/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '默认下载目录' }), {
      target: { value: 'D:\\Temporary' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '撤销' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('textbox', { name: '默认下载目录' })).toHaveValue('');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '保存设置' })).not.toBeInTheDocument(),
    );
    expect(updateGeneral).not.toHaveBeenCalled();
  });
  it('uses the saved revision when preferences are edited again', async () => {
    vi.mocked(updateGeneral)
      .mockResolvedValueOnce({ ...bootstrap.settings, output_directory: 'D:\\First', revision: 2 })
      .mockResolvedValueOnce({
        ...bootstrap.settings,
        output_directory: 'D:\\Second',
        revision: 3,
      });
    renderSettings();
    const directory = screen.getByRole('textbox', { name: '默认下载目录' });
    fireEvent.change(directory, { target: { value: 'D:\\First' } });
    fireEvent.click(await screen.findByRole('button', { name: '保存偏好' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '保存设置' })).not.toBeInTheDocument(),
    );
    fireEvent.change(directory, { target: { value: 'D:\\Second' } });
    fireEvent.click(await screen.findByRole('button', { name: '保存偏好' }));
    await waitFor(() =>
      expect(updateGeneral).toHaveBeenLastCalledWith({
        theme_mode: ThemeMode.ThemeSystem,
        max_concurrent_notes: 4,
        output_directory: 'D:\\Second',
        expected_revision: 2,
      }),
    );
  });
  it('shows a validation message instead of saving an invalid concurrency value', async () => {
    renderSettings();
    fireEvent.change(screen.getByRole('spinbutton', { name: '同时下载的笔记数' }), {
      target: { value: '' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '保存偏好' }));
    expect(await screen.findByText('请输入 1–32 之间的整数')).toBeInTheDocument();
    expect(updateGeneral).not.toHaveBeenCalled();
  });
});
