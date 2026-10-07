import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { NoteKind, ThemeMode, type NoteSummary } from '@/shared/contracts';
import { Component } from './library-route';
import { listNotes } from './api';
import { CreateDownloadDrawer } from '@/features/downloads/CreateDrawer';

vi.mock('./api', () => ({ listNotes: vi.fn() }));
vi.mock('@/features/downloads/CreateDrawer', () => ({ CreateDownloadDrawer: vi.fn(() => null) }));

const note = (id: string, kind = NoteKind.KindImage): NoteSummary => ({
  id,
  title: id,
  kind,
  raw_kind: '',
  author_id: 'author',
  author_name: '作者',
  description: '',
  has_live_photo: false,
  image_count: 1,
  video_stream_count: 0,
  motion_stream_count: 0,
  cover_url: '',
  published_at_ms: null,
  modified_at_ms: null,
  fetched_at_ms: 1_791_024_000_000,
  snapshot_id: `snapshot-${id}`,
});
const page = (items: NoteSummary[]) => ({ items, has_more: false, next_at_ms: 0, next_id: '' });
function renderLibrary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider mode={ThemeMode.ThemeLight}>
        <MemoryRouter initialEntries={['/notes']}>
          <Component />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return client;
}

const getComputedStyle = window.getComputedStyle.bind(window);
beforeEach(() => {
  vi.mocked(listNotes).mockResolvedValue(
    page([note('图文笔记'), note('视频笔记', NoteKind.KindVideo)]),
  );
  // jsdom cannot measure pseudo-elements used by Ant Design's table scrollbar.
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => getComputedStyle(element));
});

describe('library download selection', () => {
  it('keeps hidden selections when filtering and switching to the table view', async () => {
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /批量选择/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择笔记：图文笔记' }));
    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    expect(screen.queryByRole('checkbox', { name: '选择笔记：图文笔记' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '列表视图' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择笔记：视频笔记' }));
    fireEvent.click(screen.getByRole('button', { name: /批量下载/ }));
    await waitFor(() =>
      expect(vi.mocked(CreateDownloadDrawer).mock.lastCall?.[0]).toMatchObject({
        open: true,
        batchSnapshotIDs: ['snapshot-图文笔记', 'snapshot-视频笔记'],
      }),
    );
  });

  it('limits select-all to 200 snapshots instead of creating an oversized batch', async () => {
    vi.mocked(listNotes).mockResolvedValue(
      page(Array.from({ length: 201 }, (_, i) => note(`笔记-${i}`))),
    );
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /批量选择/ }));
    await screen.findByLabelText('选择笔记：笔记-200');
    fireEvent.click(screen.getByRole('checkbox', { name: '选择当前结果' }));
    expect(screen.getByLabelText('选择笔记：笔记-200')).toBeDisabled();
    fireEvent.click(screen.getByText('批量下载', { exact: true }));
    await waitFor(() =>
      expect(vi.mocked(CreateDownloadDrawer).mock.lastCall?.[0].batchSnapshotIDs).toHaveLength(200),
    );
  }, 20000);

  it('uses a refreshed snapshot for a selected note', async () => {
    const client = renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /批量选择/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择笔记：图文笔记' }));
    vi.mocked(listNotes).mockResolvedValue(
      page([{ ...note('图文笔记'), snapshot_id: 'updated-snapshot' }]),
    );
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['notes'] });
    });
    fireEvent.click(screen.getByRole('button', { name: /批量下载/ }));
    await waitFor(() =>
      expect(vi.mocked(CreateDownloadDrawer).mock.lastCall?.[0]).toMatchObject({
        open: true,
        batchSnapshotIDs: ['updated-snapshot'],
      }),
    );
  });
});
