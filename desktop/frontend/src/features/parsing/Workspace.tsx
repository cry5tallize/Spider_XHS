import { useEffect, useState } from 'react';
import { Alert, App, Button, Checkbox, Collapse, Skeleton, Space, Tag } from 'antd';
import {
  ArrowRightOutlined,
  PauseOutlined,
  CaretRightOutlined,
  ReloadOutlined,
  StopOutlined,
  EditOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  AccountStatus,
  CollectionMode,
  CollectionState,
  CollectionItemState,
  SourceState,
  type CollectionItem,
  type CollectionJob,
} from '@/shared/contracts';
import { PageHeading, WorkspaceEmpty } from '@/shared/components/Workspace';
import { NoteCover } from '@/shared/components/NoteCover';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { usePageFilters } from '@/shared/hooks/use-page-filters';
import { DownloadPanel } from '@/features/downloads/DownloadPanel';
import { listParseJobs } from '@/features/notes/api';
import { parseStates, isActiveParse, formatTime } from '@/features/notes/labels';
import { InputComposer } from './InputComposer';
import { NotePreview } from './NotePreview';
import {
  getCollectionDefaults,
  listAccounts,
  listCollections,
  getCollection,
  getCollectionItems,
  getCollectionSources,
  pauseCollection,
  resumeCollection,
  retryCollection,
  cancelCollection,
} from './api';
import { collectionActive, collectionStates, collectionItemLabels } from './labels';

const usable = (item: CollectionItem) =>
  !!item.snapshot_id &&
  [CollectionItemState.Complete, CollectionItemState.Incomplete].includes(item.state);
export function ParseWorkspace({ initialJobID = '' }: { initialJobID?: string }) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { params, update } = usePageFilters();
  const jobID = params.get('job') || initialJobID;
  const [chosenMode, setChosenMode] = useState<CollectionMode>();
  const [editing, setEditing] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const config = useQuery({
    queryKey: ['collection-defaults'],
    queryFn: ({ signal }) => getCollectionDefaults(signal),
    staleTime: Infinity,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: ({ signal }) => listAccounts(signal),
  });
  const job = useQuery({
    queryKey: ['collection', jobID],
    enabled: !!jobID,
    queryFn: ({ signal }) => getCollection(jobID, signal),
    staleTime: 0,
    refetchInterval: (q) => (q.state.data && collectionActive(q.state.data.state) ? 1000 : false),
  });
  const active = !!job.data && collectionActive(job.data.state);
  const mode =
    chosenMode ||
    job.data?.mode ||
    (params.get('mode') === 'users' ? CollectionMode.ModeUsers : CollectionMode.ModeNotes);
  const recent = useQuery({
    queryKey: ['collections'],
    queryFn: ({ signal }) => listCollections(signal),
    staleTime: 10000,
  });
  const legacy = useQuery({
    queryKey: ['parse-jobs'],
    queryFn: ({ signal }) => listParseJobs(signal),
    staleTime: 10000,
    refetchInterval: (q) =>
      q.state.data?.some((item) => isActiveParse(item.state)) ? 2000 : false,
  });
  const action = useMutation({
    mutationFn: (kind: 'pause' | 'resume' | 'retry' | 'cancel') =>
      ({
        pause: pauseCollection,
        resume: resumeCollection,
        retry: retryCollection,
        cancel: cancelCollection,
      })[kind](jobID),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['collection', jobID] });
      void client.invalidateQueries({ queryKey: ['collections'] });
    },
    onError: (error: Error) => {
      void message.error(error.message);
    },
  });
  const onCreated = (next: CollectionJob) => {
    client.setQueryData(['collection', next.id], next);
    setChosenMode(next.mode);
    setEditing(false);
    setRecentOpen(false);
    if (initialJobID) void navigate('/parse?job=' + next.id);
    else update({ job: next.id, mode: undefined });
  };
  const visibleRecent = recentOpen ? recent.data || [] : (recent.data || []).slice(0, 4);
  return (
    <div className="page workspace-page calm-page parse-workspace">
      <PageHeading
        title="解析笔记"
        description={!jobID ? '粘贴链接，预览后选择下载。' : undefined}
        actions={
          <>
            {jobID && (
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? '收起输入' : '编辑输入'}
              </Button>
            )}
            <Button
              type="text"
              icon={<LinkOutlined />}
              onClick={() => {
                if (initialJobID) void navigate('/parse');
                else update({ job: undefined });
                setEditing(false);
              }}
            >
              新解析
            </Button>
          </>
        }
      />
      {accounts.isError && (
        <Alert
          type="error"
          title="账号加载失败"
          description={accounts.error.message}
          action={<Button onClick={() => void accounts.refetch()}>重试</Button>}
        />
      )}
      {!accounts.isPending &&
        !accounts.isError &&
        !accounts.data?.some(
          (account) =>
            account.enabled &&
            account.has_cookie &&
            ![
              AccountStatus.Expired,
              AccountStatus.Restricted,
              AccountStatus.Disabled,
              AccountStatus.Error,
            ].includes(account.status),
        ) && (
          <Alert
            className="workspace-alert"
            type="info"
            title="需要一个可用的解析账号"
            action={<Button onClick={() => void navigate('/accounts')}>添加或校验账号</Button>}
          />
        )}
      <div hidden={!!jobID && !editing}>
        {config.isPending ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : config.isError ? (
          <Alert
            type="error"
            title="解析选项加载失败"
            description={config.error.message}
            action={<Button onClick={() => void config.refetch()}>重试</Button>}
          />
        ) : (
          <InputComposer
            mode={mode}
            onMode={setChosenMode}
            defaults={config.data}
            accounts={accounts.data || []}
            onCreated={onCreated}
          />
        )}
      </div>
      {jobID && (
        <>
          <div className="parse-job-toolbar">
            <div>
              <Tag color={job.data ? collectionStates[job.data.state].color : undefined}>
                {job.data ? collectionStates[job.data.state].label : '读取结果'}
              </Tag>
              <span>
                {job.data?.mode === CollectionMode.ModeUsers ? '用户主页' : '笔记链接'}
                {job.data && ' · ' + job.data.source_count + ' 个来源'}
              </span>
              {job.data && (
                <small>
                  {job.data.completed} 条已完成
                  {job.data.failed_items > 0 && ' · ' + job.data.failed_items + ' 条失败'}
                  {active && ' · 已发现 ' + job.data.discovered + ' 条'}
                </small>
              )}
            </div>
            <Space size={8}>
              {active && (
                <Button
                  size="small"
                  icon={<PauseOutlined />}
                  disabled={action.isPending}
                  onClick={() => action.mutate('pause')}
                >
                  暂停
                </Button>
              )}
              {job.data &&
                [CollectionState.Paused, CollectionState.Interrupted].includes(job.data.state) && (
                  <Button
                    size="small"
                    icon={<CaretRightOutlined />}
                    disabled={action.isPending}
                    onClick={() => action.mutate('resume')}
                  >
                    继续解析
                  </Button>
                )}
              {job.data &&
                [CollectionState.Failed, CollectionState.Partial].includes(job.data.state) && (
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    disabled={action.isPending}
                    onClick={() => action.mutate('retry')}
                  >
                    重试失败项
                  </Button>
                )}
              {job.data &&
                [
                  CollectionState.Queued,
                  CollectionState.Running,
                  CollectionState.Paused,
                  CollectionState.Interrupted,
                ].includes(job.data.state) && (
                  <Button
                    size="small"
                    type="text"
                    icon={<StopOutlined />}
                    disabled={action.isPending}
                    onClick={() =>
                      modal.confirm({
                        title: '取消本次解析？',
                        content: '已解析的笔记会保留。',
                        okText: '取消解析',
                        cancelText: '继续解析',
                        onOk: () => action.mutateAsync('cancel'),
                      })
                    }
                  >
                    取消
                  </Button>
                )}
            </Space>
          </div>
          {job.isError ? (
            <Alert
              type="error"
              title="解析记录加载失败"
              description={job.error.message}
              action={<Button onClick={() => void job.refetch()}>重试</Button>}
            />
          ) : (
            <WorkspaceResults
              key={jobID}
              jobID={jobID}
              job={job.data}
              active={active}
              revision={job.data?.revision}
            />
          )}
        </>
      )}
      {(!!recent.data?.length || !!legacy.data?.length) && (
        <section className="parse-recent">
          <div className="parse-recent-heading">
            <h2>最近解析</h2>
            <Button type="text" size="small" onClick={() => setRecentOpen((value) => !value)}>
              {recentOpen ? '收起' : '查看全部'}
            </Button>
          </div>
          <div className="parse-recent-list">
            {visibleRecent.map((item) => (
              <button
                type="button"
                className={item.id === jobID ? 'parse-recent-row is-current' : 'parse-recent-row'}
                key={item.id}
                onClick={() => {
                  setEditing(false);
                  if (initialJobID) void navigate('/parse?job=' + item.id);
                  else update({ job: item.id });
                }}
              >
                <span>
                  {item.mode === CollectionMode.ModeUsers
                    ? '用户主页'
                    : item.source_count > 1
                      ? '多条笔记'
                      : '单条笔记'}{' '}
                  · {item.completed} 条已解析
                </span>
                <small>{formatTime(item.created_at_ms)}</small>
                <span>{collectionStates[item.state].label}</span>
                <ArrowRightOutlined />
              </button>
            ))}
            {(recentOpen ? legacy.data || [] : (legacy.data || []).slice(0, 2)).map((item) => (
              <button
                type="button"
                className="parse-recent-row"
                key={item.id}
                disabled={!item.snapshot_id}
                onClick={() =>
                  void navigate('/notes/' + item.note_id + '?snapshot=' + item.snapshot_id)
                }
              >
                <span>旧版单条记录 · {item.note_id}</span>
                <small>{formatTime(item.created_at_ms)}</small>
                <span>{parseStates[item.state].label}</span>
                <ArrowRightOutlined />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
function WorkspaceResults({
  jobID,
  job,
  active,
  revision,
}: {
  jobID: string;
  job?: CollectionJob;
  active: boolean;
  revision?: number;
}) {
  const client = useQueryClient();
  const [focusedID, setFocusedID] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState(new Set<string>());
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const items = useInfiniteQuery({
    queryKey: ['collection-items', jobID],
    initialPageParam: {
      job_id: jobID,
      limit: 50,
      after_ordinal: 0,
      state: CollectionItemState.ItemUnknown,
    },
    queryFn: ({ pageParam, signal }) => getCollectionItems(pageParam, signal),
    staleTime: 0,
    getNextPageParam: (page) =>
      page.has_more
        ? {
            job_id: jobID,
            limit: 50,
            after_ordinal: page.next_ordinal,
            state: CollectionItemState.ItemUnknown,
          }
        : undefined,
  });
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ['collection-items', jobID] });
    if (revision !== undefined && !active) void client.invalidateQueries({ queryKey: ['notes'] });
  }, [client, jobID, revision, active]);
  const sources = useQuery({
    queryKey: ['collection-sources', jobID],
    enabled: !!job && !active,
    queryFn: ({ signal }) => getCollectionSources(jobID, signal),
    staleTime: 0,
  });
  const rows = items.data?.pages.flatMap((page) => page.items || []) || [];
  const successful = rows.filter(usable);
  const filtered = rows.filter((item) =>
    filter === 'success'
      ? usable(item)
      : filter === 'failed'
        ? item.state === CollectionItemState.ItemFailed
        : true,
  );
  const selected = successful.filter((item) => selection.has(item.snapshot_id));
  const autoSingle = rows.length === 1 && successful.length === 1 && !items.hasNextPage && !active;
  const focus =
    successful.find((item) => item.snapshot_id === focusedID) ||
    (autoSingle ? successful[0] : undefined);
  const targets = selecting ? selected : focus ? [focus] : [];
  const hint = {
    images: targets.some(
      (item) => item.image_count > item.live_photo_count && item.raw_kind !== 'video',
    ),
    videos: targets.some((item) => item.video_stream_count > 0),
    covers: targets.some((item) => item.image_count > 0 && item.raw_kind === 'video'),
    live: targets.some((item) => item.has_live_photo),
  };
  const failures =
    sources.data?.filter((source) => source.state === SourceState.SourceFailed || source.failure) ||
    [];
  const choose = (item: CollectionItem, checked: boolean) =>
    setSelection((current) => {
      const next = new Set(current);
      if (checked && next.size < 200) next.add(item.snapshot_id);
      if (!checked) next.delete(item.snapshot_id);
      return next;
    });
  const chooseAll = (checked: boolean) =>
    setSelection((current) => {
      const next = new Set(current);
      for (const item of filtered.filter(usable)) {
        if (checked && next.size < 200) next.add(item.snapshot_id);
        if (!checked) next.delete(item.snapshot_id);
      }
      return next;
    });
  return (
    <section className="parse-result-section">
      {job?.limit_reason && (
        <Alert
          className="workspace-alert"
          type="info"
          title="达到本次解析范围"
          description={job.limit_reason}
        />
      )}
      {job?.failure && (
        <Alert className="workspace-alert" type="warning" title={job.failure.message} />
      )}
      {failures.length > 0 && (
        <Collapse
          className="workspace-alert"
          items={[
            {
              key: 'sources',
              label: failures.length + ' 个来源未能完成',
              children: failures.map((source) => (
                <p key={source.id}>
                  输入 {source.index} ·{' '}
                  {source.failure?.message || source.limit_reason || '来源解析失败'}
                </p>
              )),
            },
          ]}
        />
      )}
      {rows.length > 1 && (
        <div className="parse-results-heading">
          <div className="parse-result-filters">
            {[
              { value: 'all', label: '全部结果' },
              { value: 'success', label: '可下载' },
              { value: 'failed', label: '失败' },
            ].map((tab) => (
              <button
                type="button"
                aria-pressed={filter === tab.value}
                className={filter === tab.value ? 'is-active' : ''}
                key={tab.value}
                onClick={() => setFilter(tab.value as typeof filter)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Button
            type="text"
            icon={selecting ? <CloseOutlined /> : <CheckSquareOutlined />}
            onClick={() => {
              setSelecting((value) => !value);
              setSelection(new Set());
              setFocusedID('');
            }}
          >
            {selecting ? '取消选择' : '批量选择'}
          </Button>
        </div>
      )}
      {selecting && (
        <div className="selection-toolbar">
          <Checkbox
            aria-label="全选解析结果"
            checked={
              filtered.filter(usable).length > 0 &&
              filtered.filter(usable).every((item) => selection.has(item.snapshot_id))
            }
            indeterminate={
              filtered.some((item) => usable(item) && selection.has(item.snapshot_id)) &&
              !filtered.filter(usable).every((item) => selection.has(item.snapshot_id))
            }
            onChange={(event) => chooseAll(event.target.checked)}
          >
            全选
          </Checkbox>
          <span>
            已选 {selected.length} 条{selection.size >= 200 && ' · 单次最多 200 条'}
          </span>
        </div>
      )}
      {items.isError && (
        <Alert
          type="error"
          title="结果加载失败"
          description={items.error.message}
          action={<Button onClick={() => void items.refetch()}>重试</Button>}
        />
      )}
      <div className={'parse-result-layout' + (targets.length ? ' has-download' : '')}>
        <div className="parse-result-content">
          {focus ? (
            <NotePreview
              key={focus.snapshot_id}
              snapshotID={focus.snapshot_id}
              onBack={!autoSingle ? () => setFocusedID('') : undefined}
            />
          ) : items.isPending || (active && !rows.length) ? (
            <div className="parse-results-loading">
              <Skeleton active paragraph={{ rows: 4 }} />
              <span className="workspace-muted">正在解析，结果会出现在这里。</span>
            </div>
          ) : rows.length ? (
            filtered.length ? (
              <div className="parse-results-grid">
                {filtered.map((item) => {
                  const valid = usable(item);
                  return (
                    <article
                      className={
                        'parse-result-card' +
                        (selection.has(item.snapshot_id) ? ' is-selected' : '')
                      }
                      key={item.id}
                    >
                      <button
                        type="button"
                        className="parse-result-cover"
                        disabled={
                          !valid ||
                          (selecting && selection.size >= 200 && !selection.has(item.snapshot_id))
                        }
                        aria-label={
                          (selecting ? '选择结果：' : '预览笔记：') + (item.title || item.note_id)
                        }
                        onClick={() =>
                          selecting
                            ? choose(item, !selection.has(item.snapshot_id))
                            : setFocusedID(item.snapshot_id)
                        }
                      >
                        <NoteCover src={item.cover_url} title={item.title || item.note_id} />
                      </button>
                      {selecting && valid && (
                        <Checkbox
                          className="note-card-checkbox"
                          aria-label={'选择解析笔记：' + (item.title || item.note_id)}
                          disabled={selection.size >= 200 && !selection.has(item.snapshot_id)}
                          checked={selection.has(item.snapshot_id)}
                          onChange={(event) => choose(item, event.target.checked)}
                        />
                      )}
                      <button
                        type="button"
                        className="workspace-title-button"
                        disabled={!valid}
                        onClick={() =>
                          selecting
                            ? choose(item, !selection.has(item.snapshot_id))
                            : setFocusedID(item.snapshot_id)
                        }
                      >
                        {item.title || item.note_id}
                      </button>
                      <div className="parse-card-author">
                        <UserAvatar
                          url={item.author_avatar}
                          name={item.author_name || '未知作者'}
                          size={22}
                        />
                        <span>
                          {item.author_name ||
                            (valid ? '未知作者' : collectionItemLabels[item.state])}
                        </span>
                      </div>
                      {item.failure && <p className="parse-card-error">{item.failure.message}</p>}
                      {item.skip_reason && !valid && (
                        <p className="workspace-muted">{item.skip_reason}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <WorkspaceEmpty
                icon={<LinkOutlined />}
                title="当前结果没有匹配内容"
                description="更换筛选，或继续加载更多结果。"
                action="查看全部结果"
                onAction={() => setFilter('all')}
              />
            )
          ) : (
            !items.isError && (
              <WorkspaceEmpty
                icon={<LinkOutlined />}
                title="暂无解析结果"
                description="检查来源和解析账号，或重新输入链接。"
              />
            )
          )}
          {items.hasNextPage && !focus && (
            <div className="load-more">
              <Button loading={items.isFetchingNextPage} onClick={() => void items.fetchNextPage()}>
                加载更多结果
              </Button>
            </div>
          )}
        </div>
        {targets.length > 0 && (
          <DownloadPanel snapshotIDs={targets.map((item) => item.snapshot_id)} hints={hint} />
        )}
      </div>
    </section>
  );
}
