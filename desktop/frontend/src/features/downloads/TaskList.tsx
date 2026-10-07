import { useState, type ReactNode } from 'react';
import { Alert, App, Button, Dropdown, Input, Popover, Progress, Select, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FilterOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  MoreOutlined,
  PauseOutlined,
  CaretRightOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { DownloadState, type DownloadTask, type DownloadListInput } from '@/shared/contracts';
import {
  PageHeading,
  FilterTabs,
  WorkspaceEmpty,
  WorkspaceSkeleton,
} from '@/shared/components/Workspace';
import { usePageFilters } from '@/shared/hooks/use-page-filters';
import {
  listDownloadTasks,
  queryDownloadHistory,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  openDownloadDirectory,
} from './api';
import { states } from './labels';
import { useDownloadProgress, overlayProgress, isActiveDownload } from './progress-store';
import { formatBytes, formatTime } from '@/features/notes/labels';
import { TaskDrawer } from './TaskDrawer';
import { CreateDownloadDrawer } from './CreateDrawer';

const taskTime = (task: DownloadTask) =>
  task.finished_at_ms || task.started_at_ms || task.created_at_ms;
const dateLabel = (time: number) => {
  const date = new Date(time);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return '今天';
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
};

function TaskRecord({
  task,
  history,
  onOpen,
  actions,
}: {
  task: DownloadTask;
  history: boolean;
  onOpen: () => void;
  actions: ReactNode;
}) {
  const running = task.state === DownloadState.Running;
  const failed = [DownloadState.Failed, DownloadState.Partial, DownloadState.Interrupted].includes(
    task.state,
  );
  const completed = task.state === DownloadState.Succeeded;
  const done = task.successful_items + task.skipped_items;
  const fraction =
    running && task.current_total ? Math.min(task.current_bytes / task.current_total, 0.99) : 0;
  const percent = task.planned_items
    ? Math.min(100, ((done + fraction) / task.planned_items) * 100)
    : 0;
  const tone = failed ? 'danger' : completed ? 'success' : running ? 'primary' : 'neutral';
  return (
    <article className={'transfer-row ' + (history ? 'archive-row' : 'queue-row')}>
      <span className={'transfer-icon tone-' + tone} aria-hidden="true">
        {failed ? (
          <CloseCircleOutlined />
        ) : completed ? (
          <CheckCircleOutlined />
        ) : history ? (
          <FileTextOutlined />
        ) : (
          <DownloadOutlined />
        )}
      </span>
      <div className="transfer-identity">
        <button
          type="button"
          className="workspace-title-button"
          title={task.title || undefined}
          onClick={onOpen}
        >
          {task.title || '无标题笔记'}
        </button>
        <div className="transfer-meta">
          <span>{task.author_name || task.author_id || '未知作者'}</span>
          {history ? (
            <>
              <time title={formatTime(taskTime(task))}>
                {new Date(taskTime(task)).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <span className="sr-only">{states[task.state]?.label}</span>
            </>
          ) : (
            <span className={'transfer-status status-' + tone}>
              <i />
              {states[task.state]?.label || '未知'}
            </span>
          )}
        </div>
        {failed && (
          <p className="transfer-error" title={task.failure?.message || undefined}>
            {task.failure?.message ||
              (task.state === DownloadState.Interrupted
                ? '下载已中断，可以继续'
                : task.failed_items + ' 个文件未完成')}
          </p>
        )}
      </div>
      <div className="transfer-summary">
        {history || completed ? (
          <>
            <span className={failed ? 'transfer-result-failed' : ''}>
              {history && !completed
                ? states[task.state]?.label
                : formatBytes(task.completed_bytes)}
            </span>
            <small>
              {done} 个文件{task.failed_items > 0 ? ' · ' + task.failed_items + ' 个未完成' : ''}
            </small>
          </>
        ) : failed ? (
          <>
            <span>等待处理</span>
            <small>
              {done} / {task.planned_items} 个文件
            </small>
          </>
        ) : task.state === DownloadState.Canceled ? (
          <span className="workspace-muted">已取消</span>
        ) : (
          <>
            <div className="transfer-progress-caption">
              <span>
                {done} / {task.planned_items} 个文件
              </span>
              <span>{task.planned_items ? Math.round(percent) + '%' : '—'}</span>
            </div>
            <Tooltip
              title={
                running
                  ? '当前文件：' +
                    formatBytes(task.current_bytes) +
                    ' / ' +
                    formatBytes(task.current_total)
                  : undefined
              }
            >
              <Progress
                percent={percent}
                size="small"
                showInfo={false}
                status={running ? 'active' : 'normal'}
              />
            </Tooltip>
          </>
        )}
      </div>
      <div className="transfer-actions">{actions}</div>
    </article>
  );
}

export function TaskList({ history = false }: { history?: boolean }) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const live = useDownloadProgress();
  const { params, update } = usePageFilters();
  const stateParam = Number(params.get('state') || 0);
  const state = (
    Object.prototype.hasOwnProperty.call(states, stateParam) ? stateParam : DownloadState.Unknown
  ) as DownloadState;
  const noteID = params.get('note') || '';
  const search = params.get('q') || '';
  const period = ['7', '30'].includes(params.get('period') || '') ? params.get('period')! : 'all';
  const [detailID, setDetailID] = useState<string | null>(null);
  const [redownload, setRedownload] = useState<DownloadTask | null>(null);
  const query = useInfiniteQuery({
    queryKey: [history ? 'download-history' : 'downloads', state, noteID],
    staleTime: 0,
    initialPageParam: {
      limit: 50,
      before_at_ms: 0,
      before_id: '',
      state,
      note_id: noteID,
      author_id: '',
    } as DownloadListInput,
    queryFn: ({ pageParam, signal }) =>
      (history ? queryDownloadHistory : listDownloadTasks)(pageParam, signal),
    getNextPageParam: (page) =>
      page.has_more
        ? {
            limit: 50,
            before_at_ms: page.next_at_ms,
            before_id: page.next_id,
            state,
            note_id: noteID,
            author_id: '',
          }
        : undefined,
    refetchInterval: live.connected
      ? false
      : (q) =>
          q.state.data?.pages.some((page) =>
            page.items?.some((task) => isActiveDownload(task.state)),
          )
            ? 2000
            : false,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['downloads'] });
    void client.invalidateQueries({ queryKey: ['download-history'] });
  };
  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'pause' | 'resume' | 'cancel' | 'retry' }) =>
      ({
        pause: pauseDownload,
        resume: resumeDownload,
        cancel: cancelDownload,
        retry: retryDownload,
      })[kind](id),
    onSuccess: refresh,
    onError: (e: Error) => {
      void message.error(e.message);
    },
  });
  const open = useMutation({
    mutationFn: openDownloadDirectory,
    onError: (e: Error) => {
      void message.error(e.message);
    },
  });
  const rows =
    query.data?.pages
      .flatMap((page) => page.items ?? [])
      .map((task) => overlayProgress(task, live.tasks)) ?? [];
  const periodDays = period === '7' ? 7 : period === '30' ? 30 : 0;
  const cutoff = periodDays ? new Date().setHours(0, 0, 0, 0) - (periodDays - 1) * 86400000 : 0;
  const filtered = rows.filter(
    (task) =>
      [task.title, task.author_name, task.note_id]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (!history || !cutoff || taskTime(task) >= cutoff) &&
      (state === DownloadState.Unknown || task.state === state),
  );
  const groups = new Map<string, DownloadTask[]>();
  if (history)
    for (const task of [...filtered].sort((a, b) => taskTime(b) - taskTime(a))) {
      const day = dateLabel(taskTime(task));
      const group = groups.get(day);
      if (group) group.push(task);
      else groups.set(day, [task]);
    }
  const cancel = (task: DownloadTask) =>
    modal.confirm({
      title: '取消这条笔记的下载？',
      content: '已下载的文件会保留。',
      okText: '取消下载',
      okButtonProps: { danger: true },
      cancelText: '继续下载',
      onOk: () => action.mutateAsync({ id: task.id, kind: 'cancel' }),
    });
  const renderTask = (task: DownloadTask) => {
    const failed = [DownloadState.Failed, DownloadState.Partial].includes(task.state);
    const pausable = [DownloadState.Queued, DownloadState.Running].includes(task.state);
    const resumable = [DownloadState.Paused, DownloadState.Interrupted].includes(task.state);
    const cancellable = [
      DownloadState.Queued,
      DownloadState.Running,
      DownloadState.Paused,
      DownloadState.Interrupted,
    ].includes(task.state);
    const busy = action.isPending && action.variables?.id === task.id;
    return (
      <TaskRecord
        key={task.id}
        task={task}
        history={history}
        onOpen={() => setDetailID(task.id)}
        actions={
          <>
            {history ? (
              <Button
                size="small"
                icon={<FolderOpenOutlined />}
                aria-label={'打开笔记目录：' + (task.title || task.note_id)}
                loading={open.isPending && open.variables === task.id}
                disabled={open.isPending}
                onClick={() => open.mutate(task.id)}
              >
                打开文件夹
              </Button>
            ) : pausable ? (
              <Button
                size="small"
                icon={<PauseOutlined />}
                disabled={action.isPending}
                loading={busy}
                onClick={() => action.mutate({ id: task.id, kind: 'pause' })}
              >
                暂停
              </Button>
            ) : resumable ? (
              <Button
                size="small"
                type="primary"
                icon={<CaretRightOutlined />}
                disabled={action.isPending}
                loading={busy}
                onClick={() => action.mutate({ id: task.id, kind: 'resume' })}
              >
                恢复
              </Button>
            ) : failed ? (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                disabled={action.isPending}
                loading={busy}
                onClick={() => action.mutate({ id: task.id, kind: 'retry' })}
              >
                重试
              </Button>
            ) : (
              <Tooltip title="打开文件夹">
                <Button
                  type="text"
                  size="small"
                  icon={<FolderOpenOutlined />}
                  aria-label={'打开笔记目录：' + (task.title || task.note_id)}
                  loading={open.isPending && open.variables === task.id}
                  disabled={open.isPending}
                  onClick={() => open.mutate(task.id)}
                />
              </Tooltip>
            )}
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'detail', label: '查看详情', icon: <FileTextOutlined /> },
                  { key: 'note', label: '查看笔记', icon: <FileTextOutlined /> },
                  ...(history
                    ? [{ key: 'redownload', label: '重新下载', icon: <DownloadOutlined /> }]
                    : []),
                  ...(history && failed
                    ? [
                        {
                          key: 'retry',
                          label: '重试未完成项',
                          icon: <ReloadOutlined />,
                          disabled: action.isPending,
                        },
                      ]
                    : []),
                  ...(cancellable
                    ? [
                        { type: 'divider' as const },
                        {
                          key: 'cancel',
                          label: '取消下载',
                          icon: <StopOutlined />,
                          danger: true,
                          disabled: action.isPending,
                        },
                      ]
                    : []),
                ],
                onClick: ({ key }) => {
                  if (key === 'detail') setDetailID(task.id);
                  if (key === 'note') void navigate('/notes/' + task.note_id);
                  if (key === 'redownload') setRedownload(task);
                  if (key === 'retry') action.mutate({ id: task.id, kind: 'retry' });
                  if (key === 'cancel') cancel(task);
                },
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label={'更多操作：' + (task.title || task.note_id)}
              />
            </Dropdown>
          </>
        }
      />
    );
  };
  const clearFilters = () =>
    update({ state: undefined, note: undefined, q: undefined, period: undefined });
  const hasFilters =
    state !== DownloadState.Unknown || !!noteID || !!search || (history && !!periodDays);
  const quickStates = history
    ? [DownloadState.Unknown, DownloadState.Succeeded, DownloadState.Failed]
    : [
        DownloadState.Unknown,
        DownloadState.Running,
        DownloadState.Paused,
        DownloadState.Failed,
        DownloadState.Succeeded,
      ];
  const advanced = !!noteID || (history && !!periodDays) || !quickStates.includes(state);
  return (
    <div
      className={'page workspace-page calm-page ' + (history ? 'history-page' : 'downloads-page')}
    >
      <PageHeading
        title={history ? '下载历史' : '下载任务'}
        actions={
          <>
            <Tooltip title="刷新">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                aria-label="刷新下载记录"
                loading={query.isFetching && !query.isPending && !query.isFetchingNextPage}
                onClick={() => void query.refetch()}
              />
            </Tooltip>
            <Button
              type={history ? 'default' : 'primary'}
              icon={<DownloadOutlined />}
              onClick={() => void navigate(history ? '/downloads' : '/notes')}
            >
              {history ? '下载任务' : '添加下载'}
            </Button>
          </>
        }
      />
      <div className="calm-toolbar">
        <FilterTabs
          value={String(state)}
          onChange={(value) => update({ state: value === '0' ? undefined : value })}
          label="下载状态"
          items={quickStates.map((value) => ({
            value: String(value),
            label: value === DownloadState.Unknown ? '全部' : states[value].label,
          }))}
        />
        <div className="calm-toolbar-tools">
          <Input
            className="calm-search"
            prefix={<SearchOutlined />}
            placeholder="搜索标题或作者"
            aria-label="搜索下载记录"
            allowClear
            value={search}
            onChange={(event) => update({ q: event.target.value || undefined })}
            suffix={
              <Tooltip title="搜索当前已加载的记录">
                <InfoCircleOutlined className="search-hint" />
              </Tooltip>
            }
          />
          <Popover
            trigger="click"
            placement="bottomRight"
            title="更多筛选"
            content={
              <div className="advanced-filters">
                <label>
                  状态
                  <Select
                    aria-label="更多下载状态"
                    value={state}
                    onChange={(value) => update({ state: value ? String(value) : undefined })}
                    options={[
                      { value: DownloadState.Unknown, label: '全部状态' },
                      ...Object.entries(states)
                        .filter(([key]) => Number(key) > 0)
                        .map(([key, value]) => ({ value: Number(key), label: value.label })),
                    ]}
                  />
                </label>
                <label>
                  笔记 ID
                  <Input.Search
                    key={noteID}
                    defaultValue={noteID}
                    placeholder="查询所有记录中的笔记"
                    aria-label="按笔记 ID 查询全部下载记录"
                    allowClear
                    onSearch={(value) => update({ note: value.trim() || undefined })}
                  />
                </label>
                {history && (
                  <label>
                    时间
                    <Select
                      aria-label="历史时间范围"
                      value={period}
                      onChange={(value) => update({ period: value === 'all' ? undefined : value })}
                      options={[
                        { value: 'all', label: '全部时间' },
                        { value: '7', label: '最近 7 天' },
                        { value: '30', label: '最近 30 天' },
                      ]}
                    />
                    <small>时间筛选用于已加载的记录。</small>
                  </label>
                )}
                {hasFilters && <Button onClick={clearFilters}>清除筛选</Button>}
              </div>
            }
          >
            <Tooltip title="更多筛选">
              <Button
                className={advanced ? 'filter-button is-active' : 'filter-button'}
                icon={<FilterOutlined />}
                aria-label="更多筛选"
              />
            </Tooltip>
          </Popover>
        </div>
      </div>
      {advanced && (
        <div className="active-filter-line">
          {noteID && (
            <Tag closable onClose={() => update({ note: undefined })}>
              笔记 {noteID}
            </Tag>
          )}
          {!quickStates.includes(state) && (
            <Tag closable onClose={() => update({ state: undefined })}>
              {states[state].label}
            </Tag>
          )}
          {history && periodDays > 0 && (
            <Tag closable onClose={() => update({ period: undefined })}>
              最近 {periodDays} 天
            </Tag>
          )}
        </div>
      )}
      {query.isError && (
        <Alert
          className="workspace-alert"
          type="error"
          title="加载失败"
          description={query.error.message}
          showIcon
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      {query.isPending ? (
        <WorkspaceSkeleton />
      ) : filtered.length ? (
        history ? (
          <div className="archive-groups">
            {[...groups].map(([day, tasks]) => (
              <section key={day} className="archive-day">
                <h2>{day}</h2>
                <div className="transfer-list">{tasks.map(renderTask)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="transfer-list">{filtered.map(renderTask)}</div>
        )
      ) : (
        !query.isError && (
          <WorkspaceEmpty
            icon={history ? <HistoryOutlined /> : <DownloadOutlined />}
            title={
              hasFilters ? '没有找到匹配的记录' : history ? '还没有下载记录' : '还没有下载任务'
            }
            description={
              hasFilters
                ? '换个关键词或清除筛选试试。'
                : history
                  ? '下载过的笔记会保存在这里。'
                  : '从笔记库选择你想保存的内容。'
            }
            action={hasFilters ? '清除筛选' : history ? '下载任务' : '前往笔记库'}
            onAction={() =>
              hasFilters ? clearFilters() : void navigate(history ? '/downloads' : '/notes')
            }
          />
        )
      )}
      {query.hasNextPage && (
        <div className="load-more">
          <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            加载更多记录
          </Button>
        </div>
      )}
      <TaskDrawer id={detailID} onClose={() => setDetailID(null)} />
      {redownload && (
        <CreateDownloadDrawer
          open
          onClose={() => setRedownload(null)}
          snapshotID={redownload.snapshot_id}
          title={redownload.title}
          initialConfig={redownload.config}
          force
        />
      )}
    </div>
  );
}
