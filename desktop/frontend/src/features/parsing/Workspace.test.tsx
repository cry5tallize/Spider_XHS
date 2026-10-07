import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { ThemeMode, CollectionMode, CollectionItemState } from '@/shared/contracts';
import {
  fixtureAccount,
  fixtureCollectionConfig,
  fixtureDetail,
  fixtureItem,
  fixtureJob,
  fixtureNoteID,
} from '@/test/fixtures';
import { ParseWorkspace } from './Workspace';
import {
  startCollection,
  getCollectionDefaults,
  listAccounts,
  listCollections,
  getCollection,
  getCollectionItems,
  getCollectionSources,
} from './api';
import { getSnapshot, listParseJobs } from '@/features/notes/api';

vi.mock('./api', () => ({
  startCollection: vi.fn(),
  getCollectionDefaults: vi.fn(),
  listAccounts: vi.fn(),
  listCollections: vi.fn(),
  getCollection: vi.fn(),
  getCollectionItems: vi.fn(),
  getCollectionSources: vi.fn(),
  pauseCollection: vi.fn(),
  resumeCollection: vi.fn(),
  retryCollection: vi.fn(),
  cancelCollection: vi.fn(),
}));
vi.mock('@/features/notes/api', () => ({ getSnapshot: vi.fn(), listParseJobs: vi.fn() }));
vi.mock('@/features/accounts/api', () => ({ validateAccount: vi.fn() }));
vi.mock('@/shared/bridge', () => ({ openAuthorProfile: vi.fn(async () => undefined) }));
vi.mock('@/features/downloads/DownloadPanel', () => ({
  DownloadPanel: vi.fn(({ snapshotIDs }: { snapshotIDs: string[] }) => (
    <div data-testid="download-targets">{snapshotIDs.join(',')}</div>
  )),
}));
function renderWorkspace(path = '/parse') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider mode={ThemeMode.ThemeLight}>
        <MemoryRouter initialEntries={[path]}>
          <ParseWorkspace />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.mocked(getCollectionDefaults).mockResolvedValue(fixtureCollectionConfig);
  vi.mocked(listAccounts).mockResolvedValue([fixtureAccount]);
  vi.mocked(listCollections).mockResolvedValue([]);
  vi.mocked(listParseJobs).mockResolvedValue([]);
  vi.mocked(startCollection).mockResolvedValue(fixtureJob);
  vi.mocked(getCollection).mockResolvedValue(fixtureJob);
  vi.mocked(getCollectionSources).mockResolvedValue([]);
  vi.mocked(getCollectionItems).mockResolvedValue({
    items: [fixtureItem],
    has_more: false,
    next_ordinal: 0,
  });
  vi.mocked(getSnapshot).mockResolvedValue(fixtureDetail);
});
describe('parse workspace flow', () => {
  it('parses shared text and shows the author and download target without leaving the page', async () => {
    renderWorkspace();
    const input = await screen.findByRole('textbox', { name: '笔记链接输入' });
    fireEvent.change(input, {
      target: {
        value:
          '分享一条笔记\nhttps://www.xiaohongshu.com/explore/' +
          fixtureNoteID +
          '?xsec_token=token\n打开小红书查看',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /^arrow-right 解\s*析$/ }));
    await waitFor(() => expect(startCollection).toHaveBeenCalledTimes(1));
    expect(vi.mocked(startCollection).mock.calls[0][0]).toMatchObject({
      mode: CollectionMode.ModeNotes,
      account_id: fixtureAccount.id,
      text: 'https://www.xiaohongshu.com/explore/' + fixtureNoteID + '?xsec_token=token',
    });
    expect(await screen.findByRole('img', { name: '测试作者的头像' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '解析结果' })).toBeInTheDocument();
    expect(screen.getByTestId('download-targets')).toHaveTextContent('snapshot');
    fireEvent.click(screen.getByRole('button', { name: /编辑输入/ }));
    expect(screen.getByRole('textbox', { name: '笔记链接输入' })).toHaveValue(
      '分享一条笔记\nhttps://www.xiaohongshu.com/explore/' +
        fixtureNoteID +
        '?xsec_token=token\n打开小红书查看',
    );
  });
  it('restores results from a job URL without creating a new parse', async () => {
    renderWorkspace('/parse?job=job');
    expect(await screen.findByRole('img', { name: '测试作者的头像' })).toBeInTheDocument();
    expect(getSnapshot).toHaveBeenCalledWith('snapshot', expect.any(AbortSignal));
    expect(startCollection).not.toHaveBeenCalled();
  });
  it('keeps batch selection across result filters', async () => {
    vi.mocked(getCollection).mockResolvedValue({
      ...fixtureJob,
      source_count: 3,
      discovered: 3,
      completed: 2,
      failed_items: 1,
    });
    vi.mocked(getCollectionItems).mockResolvedValue({
      items: [
        fixtureItem,
        {
          ...fixtureItem,
          id: 'second',
          note_id: 'cccccccccccccccccccccccc',
          snapshot_id: 'snapshot2',
          title: '第二笔记',
          ordinal: 2,
        },
        {
          ...fixtureItem,
          id: 'failed',
          title: '失败笔记',
          snapshot_id: '',
          state: CollectionItemState.ItemFailed,
          ordinal: 3,
        },
      ],
      has_more: false,
      next_ordinal: 0,
    });
    renderWorkspace('/parse?job=job');
    fireEvent.click(await screen.findByRole('button', { name: /批量选择/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择解析笔记：解析结果' }));
    fireEvent.click(screen.getByRole('button', { name: '失败' }));
    expect(screen.getByTestId('download-targets')).toHaveTextContent('snapshot');
    fireEvent.click(screen.getByRole('button', { name: '全部结果' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择解析笔记：第二笔记' }));
    expect(screen.getByTestId('download-targets')).toHaveTextContent('snapshot,snapshot2');
  });
  it('preserves drafts when switching between note links and user profiles', async () => {
    renderWorkspace();
    const notes = await screen.findByRole('textbox', { name: '笔记链接输入' });
    fireEvent.change(notes, { target: { value: 'https://xhslink.com/a/note' } });
    fireEvent.click(screen.getByRole('button', { name: '用户主页' }));
    fireEvent.change(screen.getByRole('textbox', { name: '用户主页输入' }), {
      target: { value: 'https://www.xiaohongshu.com/user/profile/bbbbbbbbbbbbbbbbbbbbbbbb' },
    });
    fireEvent.click(screen.getByRole('button', { name: '笔记链接' }));
    expect(screen.getByRole('textbox', { name: '笔记链接输入' })).toHaveValue(
      'https://xhslink.com/a/note',
    );
    expect(startCollection).not.toHaveBeenCalled();
  });
});
