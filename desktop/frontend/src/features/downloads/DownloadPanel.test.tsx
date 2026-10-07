import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { MediaKind, ThemeMode, type PlanPreview } from '@/shared/contracts';
import { fixtureCatalog, fixtureDownloadConfig, fixturePreview } from '@/test/fixtures';
import { DownloadPanel } from './DownloadPanel';
import {
  getDownloadDefaults,
  getMediaCandidates,
  listDownloadPresets,
  previewDownloadPlans,
  createDownloadTask,
} from './api';

vi.mock('@/shared/bridge', () => ({ chooseOutputDirectory: vi.fn() }));
vi.mock('./api', () => ({
  getDownloadDefaults: vi.fn(),
  getMediaCandidates: vi.fn(),
  listDownloadPresets: vi.fn(),
  previewDownloadPlans: vi.fn(),
  createDownloadTask: vi.fn(),
  createDownloadBatch: vi.fn(),
  saveDownloadPreset: vi.fn(),
  deleteDownloadPreset: vi.fn(),
}));
vi.mock('./AdvancedOptions', () => ({ AdvancedOptions: () => null }));
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider mode={ThemeMode.ThemeLight}>
        <MemoryRouter>
          <DownloadPanel snapshotIDs={['snapshot']} />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getDownloadDefaults).mockResolvedValue(fixtureDownloadConfig());
  vi.mocked(getMediaCandidates).mockResolvedValue(fixtureCatalog);
  vi.mocked(listDownloadPresets).mockResolvedValue([]);
  vi.mocked(previewDownloadPlans).mockResolvedValue([fixturePreview()]);
  vi.mocked(createDownloadTask).mockResolvedValue(
    {} as Awaited<ReturnType<typeof createDownloadTask>>,
  );
});
describe('download plan ownership', () => {
  it('previews automatically and creates only after an explicit download click', async () => {
    renderPanel();
    const button = await screen.findByRole('button', { name: /下载笔记/ });
    await waitFor(() => expect(button).toBeEnabled());
    expect(previewDownloadPlans).toHaveBeenCalled();
    expect(createDownloadTask).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(createDownloadTask).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createDownloadTask).mock.calls[0][0]).toMatchObject({
      snapshot_id: 'snapshot',
      config: {
        media: { pretty: false, live_photo_static: true },
        selection: { motion: { codec_groups: [] } },
      },
    });
    expect(await screen.findByText('已加入下载队列', { exact: true })).toBeInTheDocument();
  });
  it('keeps download disabled while a changed configuration waits for its own preview', async () => {
    let resolveOld!: (plans: PlanPreview[]) => void;
    let resolveNew!: (plans: PlanPreview[]) => void;
    vi.mocked(previewDownloadPlans)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          }),
      );
    renderPanel();
    await waitFor(() => expect(previewDownloadPlans).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('checkbox', { name: '笔记正文' }));
    await waitFor(() => expect(previewDownloadPlans).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveOld([fixturePreview()]);
    });
    expect(screen.getByRole('button', { name: /下载笔记/ })).toBeDisabled();
    await act(async () => {
      resolveNew([fixturePreview(MediaKind.MediaText)]);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /下载笔记/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /下载笔记/ }));
    await waitFor(() => expect(createDownloadTask).toHaveBeenCalled());
    expect(vi.mocked(createDownloadTask).mock.calls[0][0].config.media.text).toBe(true);
  });
});
