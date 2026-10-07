import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import {
  DownloadState,
  ThemeMode,
  type DownloadConfig,
  type DownloadTask,
} from '@/shared/contracts';
import { TaskList } from './TaskList';
import {
  listDownloadTasks,
  queryDownloadHistory,
  resumeDownload,
  openDownloadDirectory,
} from './api';
import { CreateDownloadDrawer } from './CreateDrawer';
import { progressStore } from './progress-store';

vi.mock('./api', () => ({
  listDownloadTasks: vi.fn(),
  queryDownloadHistory: vi.fn(),
  pauseDownload: vi.fn(),
  resumeDownload: vi.fn(),
  cancelDownload: vi.fn(),
  retryDownload: vi.fn(),
  openDownloadDirectory: vi.fn(),
}));
vi.mock('./TaskDrawer', () => ({ TaskDrawer: () => null }));
vi.mock('./CreateDrawer', () => ({ CreateDownloadDrawer: vi.fn(() => null) }));

const task = (id: string, state: DownloadState): DownloadTask => ({
  id,
  state,
  title: id,
  batch_id: '',
  live_pairs: null,
  note_id: `note-${id}`,
  snapshot_id: `snapshot-${id}`,
  author_id: 'author',
  author_name: '作者',
  account_id: 'account',
  relative_directory: id,
  plan_hash: '',
  config: { output: { directory: 'D:/Downloads' } } as DownloadConfig,
  planned_items: 2,
  successful_items: 1,
  skipped_items: 0,
  failed_items: 0,
  fulfilled_items: 1,
  completed_bytes: 1024,
  transferred_bytes: 1024,
  current_item_id: '',
  current_sequence: 1,
  current_bytes: 0,
  current_total: null,
  failure: null,
  created_at_ms: Date.now(),
  started_at_ms: Date.now(),
  finished_at_ms: null,
  updated_at_ms: Date.now(),
  revision: 1,
});
const page = (items: DownloadTask[], has_more = false) => ({
  items,
  has_more,
  next_at_ms: 1234,
  next_id: 'cursor',
});
function renderTasks(path = '/downloads', history = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider mode={ThemeMode.ThemeLight}>
        <MemoryRouter initialEntries={[path]}>
          <TaskList history={history} />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(listDownloadTasks).mockResolvedValue(page([]));
  vi.mocked(queryDownloadHistory).mockResolvedValue(page([]));
});

describe('task list commands and filters', () => {
  it('keeps server filters when loading the next page', async () => {
    vi.mocked(listDownloadTasks)
      .mockResolvedValueOnce(page([task('第一条', DownloadState.Paused)], true))
      .mockResolvedValue(page([task('第二条', DownloadState.Paused)]));
    renderTasks(`/downloads?state=${DownloadState.Paused}&note=note-id`);
    fireEvent.click(await screen.findByRole('button', { name: '加载更多记录' }));
    await waitFor(() =>
      expect(listDownloadTasks).toHaveBeenLastCalledWith(
        {
          limit: 50,
          before_at_ms: 1234,
          before_id: 'cursor',
          state: DownloadState.Paused,
          note_id: 'note-id',
          author_id: '',
        },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole('button', { name: '第二条' })).toBeInTheDocument();
  });

  it('resumes the selected task through the existing backend command', async () => {
    vi.mocked(listDownloadTasks).mockResolvedValue(page([task('暂停任务', DownloadState.Paused)]));
    vi.mocked(resumeDownload).mockResolvedValue(task('暂停任务', DownloadState.Queued));
    renderTasks();
    fireEvent.click(await screen.findByRole('button', { name: /恢复/ }));
    await waitFor(() => expect(resumeDownload).toHaveBeenCalledWith('暂停任务'));
  });

  it('removes a task from the running filter when a live event pauses it', async () => {
    const running = task('实时任务', DownloadState.Running);
    vi.mocked(listDownloadTasks).mockResolvedValue(page([running]));
    renderTasks(`/downloads?state=${DownloadState.Running}`);
    await screen.findByRole('button', { name: '实时任务' });
    act(() =>
      progressStore.merge([{ ...running, state: DownloadState.Paused, revision: 2 }], true),
    );
    expect(screen.queryByRole('button', { name: '实时任务' })).not.toBeInTheDocument();
    expect(screen.getByText('没有找到匹配的记录')).toBeInTheDocument();
  });

  it('queries history and groups each record by its completion date', async () => {
    const today = task('今天完成', DownloadState.Succeeded);
    const yesterday = task('昨天完成', DownloadState.Succeeded);
    yesterday.finished_at_ms = new Date().setHours(-12, 0, 0, 0);
    today.finished_at_ms = Date.now();
    vi.mocked(queryDownloadHistory).mockResolvedValue(page([today, yesterday]));
    renderTasks('/history', true);
    await screen.findByRole('button', { name: '今天完成' });
    expect(listDownloadTasks).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '今天' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '昨天' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开笔记目录：今天完成' }));
    await waitFor(() =>
      expect(vi.mocked(openDownloadDirectory).mock.calls[0]?.[0]).toBe('今天完成'),
    );
    fireEvent.click(screen.getByRole('button', { name: '更多操作：今天完成' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /重新下载/ }));
    await waitFor(() =>
      expect(vi.mocked(CreateDownloadDrawer).mock.lastCall?.[0]).toMatchObject({
        open: true,
        snapshotID: today.snapshot_id,
        force: true,
      }),
    );
  });
});
