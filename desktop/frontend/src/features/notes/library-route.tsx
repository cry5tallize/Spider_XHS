import { useState } from 'react';
import { Alert, Button, Checkbox, Dropdown, Input, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  CheckSquareOutlined,
  DownloadOutlined,
  FileImageOutlined,
  LinkOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  TableOutlined,
  InfoCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { NoteKind, type NoteSummary, type NoteListInput } from '@/shared/contracts';
import {
  PageHeading,
  FilterTabs,
  WorkspaceEmpty,
  WorkspaceSkeleton,
} from '@/shared/components/Workspace';
import { NoteCover } from '@/shared/components/NoteCover';
import { usePageFilters } from '@/shared/hooks/use-page-filters';
import { listNotes } from './api';
import { noteKindLabel, formatTime } from './labels';
import { CreateDownloadDrawer } from '@/features/downloads/CreateDrawer';

export function Component() {
  const navigate = useNavigate();
  const { params, update } = usePageFilters();
  const search = params.get('q') || '';
  const kind = ['image', 'video', 'live'].includes(params.get('kind') || '')
    ? params.get('kind')!
    : 'all';
  const view = params.get('view') === 'list' ? 'list' : 'grid';
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState(new Map<string, NoteSummary>());
  const [batchOpen, setBatchOpen] = useState(false);
  const [downloadNote, setDownloadNote] = useState<NoteSummary | null>(null);
  const notes = useInfiniteQuery({
    queryKey: ['notes'],
    staleTime: 0,
    initialPageParam: { limit: 50, before_at_ms: 0, before_id: '' } as NoteListInput,
    queryFn: ({ pageParam, signal }) => listNotes(pageParam, signal),
    getNextPageParam: (page) =>
      page.has_more
        ? { limit: 50, before_at_ms: page.next_at_ms, before_id: page.next_id }
        : undefined,
  });
  const rows = notes.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const selected = [...selection.values()].map(
    (note) => rows.find((current) => current.id === note.id) || note,
  );
  const filtered = rows.filter(
    (note) =>
      [note.title, note.author_name, note.id]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (kind === 'image'
        ? note.kind === NoteKind.KindImage
        : kind === 'video'
          ? note.kind === NoteKind.KindVideo
          : kind === 'live'
            ? note.has_live_photo
            : true),
  );
  const allSelected = filtered.length > 0 && filtered.every((note) => selection.has(note.id));
  const someSelected = filtered.some((note) => selection.has(note.id));
  const toggleNote = (note: NoteSummary, checked: boolean) =>
    setSelection((current) => {
      const next = new Map(current);
      if (checked && next.size < 200) next.set(note.id, note);
      if (!checked) next.delete(note.id);
      return next;
    });
  const toggleVisible = (checked: boolean) =>
    setSelection((current) => {
      const next = new Map(current);
      for (const note of filtered) {
        if (checked && next.size < 200) next.set(note.id, note);
        if (!checked) next.delete(note.id);
      }
      return next;
    });
  const cancelSelection = () => {
    setSelection(new Map());
    setSelecting(false);
  };
  const clearFilters = () => update({ q: undefined, kind: undefined });
  const hasFilters = !!search || kind !== 'all';
  return (
    <div className="page workspace-page calm-page library-page">
      <PageHeading
        title="笔记库"
        actions={
          <>
            <Button
              type="text"
              icon={selecting ? <CloseOutlined /> : <CheckSquareOutlined />}
              onClick={() => (selecting ? cancelSelection() : setSelecting(true))}
            >
              {selecting ? '取消选择' : '批量选择'}
            </Button>
            <Button type="primary" icon={<LinkOutlined />} onClick={() => void navigate('/parse')}>
              解析笔记
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [{ key: 'refresh', label: '刷新笔记', icon: <ReloadOutlined /> }],
                onClick: () => {
                  void notes.refetch();
                },
              }}
            >
              <Button
                type="text"
                icon={<MoreOutlined />}
                aria-label="笔记库更多操作"
                loading={notes.isFetching && !notes.isPending && !notes.isFetchingNextPage}
              />
            </Dropdown>
          </>
        }
      />
      <div className="calm-toolbar">
        <FilterTabs
          value={kind}
          onChange={(value) => update({ kind: value === 'all' ? undefined : value })}
          label="笔记类型"
          items={[
            { value: 'all', label: '全部' },
            { value: 'image', label: '图文' },
            { value: 'video', label: '视频' },
            { value: 'live', label: 'LivePhoto' },
          ]}
        />
        <div className="calm-toolbar-tools">
          <Input
            className="calm-search"
            prefix={<SearchOutlined />}
            placeholder="搜索笔记或作者"
            aria-label="搜索笔记"
            allowClear
            value={search}
            onChange={(event) => update({ q: event.target.value || undefined })}
            suffix={
              <Tooltip title="搜索当前已加载的笔记，可继续加载更多">
                <InfoCircleOutlined className="search-hint" />
              </Tooltip>
            }
          />
          <Tooltip title={view === 'grid' ? '切换为列表' : '切换为卡片'}>
            <Button
              icon={view === 'grid' ? <TableOutlined /> : <AppstoreOutlined />}
              aria-label={view === 'grid' ? '列表视图' : '卡片视图'}
              onClick={() => update({ view: view === 'grid' ? 'list' : undefined })}
            />
          </Tooltip>
        </div>
      </div>
      {selecting && (
        <div className="selection-toolbar" role="region" aria-label="批量下载操作">
          <Checkbox
            aria-label="选择当前结果"
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            disabled={!filtered.length || (selection.size >= 200 && !someSelected)}
            onChange={(event) => toggleVisible(event.target.checked)}
          >
            全选
          </Checkbox>
          <span>
            {selected.length ? '已选 ' + selected.length + ' 条' : '选择想下载的笔记'}
            {selected.length >= 200 && <small>（最多 200 条）</small>}
          </span>
          <Button
            type="primary"
            size="small"
            icon={<DownloadOutlined />}
            disabled={!selected.length}
            onClick={() => setBatchOpen(true)}
          >
            批量下载
          </Button>
        </div>
      )}
      {notes.isError && (
        <Alert
          className="workspace-alert"
          type="error"
          showIcon
          title="加载失败"
          description={notes.error.message}
          action={<Button onClick={() => void notes.refetch()}>重试</Button>}
        />
      )}
      {notes.isPending ? (
        <WorkspaceSkeleton />
      ) : !filtered.length ? (
        !notes.isError && (
          <WorkspaceEmpty
            icon={<FileImageOutlined />}
            title={hasFilters ? '没有找到匹配的笔记' : '还没有保存的笔记'}
            description={
              hasFilters ? '换个关键词或分类试试。' : '解析一条小红书链接，笔记就会出现在这里。'
            }
            action={hasFilters ? '清除筛选' : '解析笔记'}
            onAction={() => (hasFilters ? clearFilters() : void navigate('/parse'))}
          />
        )
      ) : (
        <div className={view === 'grid' ? 'collection-grid' : 'collection-list'}>
          {filtered.map((note) => {
            const checked = selection.has(note.id);
            const disabled = selecting && selection.size >= 200 && !checked;
            const openNote = () =>
              selecting ? toggleNote(note, !checked) : void navigate('/notes/' + note.id);
            return (
              <article
                className={'collection-note' + (checked ? ' is-selected' : '')}
                key={note.id}
              >
                <div className="collection-cover">
                  <button
                    type="button"
                    className="note-cover-link"
                    aria-label={(selecting ? '切换选择：' : '查看笔记：') + (note.title || note.id)}
                    disabled={disabled}
                    title={selecting ? undefined : '解析于 ' + formatTime(note.fetched_at_ms)}
                    onClick={openNote}
                  >
                    <NoteCover src={note.cover_url} title={note.title} />
                  </button>
                  {selecting && (
                    <Checkbox
                      className="note-card-checkbox"
                      aria-label={'选择笔记：' + (note.title || note.id)}
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => toggleNote(note, event.target.checked)}
                    />
                  )}
                  {note.kind === NoteKind.KindVideo && (
                    <span className="collection-play" aria-label="视频笔记">
                      <PlayCircleOutlined />
                    </span>
                  )}
                  {(note.has_live_photo || note.image_count > 1) && (
                    <span className="collection-cover-label">
                      {note.has_live_photo ? 'LivePhoto' : note.image_count + ' 张'}
                    </span>
                  )}
                </div>
                <div className="collection-caption">
                  <button
                    type="button"
                    className="workspace-title-button collection-title"
                    onClick={openNote}
                    disabled={disabled}
                  >
                    {note.title || '无标题笔记'}
                  </button>
                  <div className="collection-author">
                    <span>{note.author_name || '未知作者'}</span>
                    <Tooltip title="下载笔记">
                      <Button
                        type="text"
                        size="small"
                        icon={<DownloadOutlined />}
                        aria-label={'下载笔记：' + (note.title || note.id)}
                        onClick={() => setDownloadNote(note)}
                      />
                    </Tooltip>
                  </div>
                </div>
                {view === 'list' && (
                  <div className="collection-list-meta">
                    <span>{noteKindLabel(note.kind)}</span>
                    <time title={formatTime(note.fetched_at_ms)}>
                      {new Date(note.fetched_at_ms).toLocaleDateString('zh-CN')}
                    </time>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {notes.hasNextPage && (
        <div className="load-more">
          <Button loading={notes.isFetchingNextPage} onClick={() => void notes.fetchNextPage()}>
            加载更多笔记
          </Button>
        </div>
      )}
      <CreateDownloadDrawer
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        snapshotID=""
        batchSnapshotIDs={selected.map((note) => note.snapshot_id)}
        title={'已选 ' + selected.length + ' 条笔记'}
      />
      {downloadNote && (
        <CreateDownloadDrawer
          open
          onClose={() => setDownloadNote(null)}
          snapshotID={downloadNote.snapshot_id}
          title={downloadNote.title}
        />
      )}
    </div>
  );
}
