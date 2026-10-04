import { useState } from 'react';
import { Alert, App, Button, Card, Input, Progress, Select, Space, Table, Tag, Typography } from 'antd';
import { FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DownloadState, type DownloadTask, type DownloadListInput } from '@/shared/contracts';
import { listDownloadTasks, queryDownloadHistory, pauseDownload, resumeDownload, cancelDownload, retryDownload, openDownloadDirectory } from './api';
import { states } from './labels';
import { useDownloadProgress, overlayProgress, isActiveDownload } from './progress-store';
import { formatBytes, formatTime } from '@/features/notes/labels';
import { TaskDrawer } from './TaskDrawer';
import { CreateDownloadDrawer } from './CreateDrawer';

export function TaskList({ history = false }: { history?: boolean }) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const live = useDownloadProgress();
  const [state, setState] = useState<DownloadState>(DownloadState.Unknown);
  const [noteID, setNoteID] = useState('');
  const [detailID, setDetailID] = useState<string | null>(null);
  const [redownload, setRedownload] = useState<DownloadTask | null>(null);
  const query = useInfiniteQuery({ queryKey: [history ? 'download-history' : 'downloads', state, noteID], staleTime: 0,
    initialPageParam: { limit: 50, before_at_ms: 0, before_id: '', state, note_id: noteID, author_id: '' } as DownloadListInput,
    queryFn: ({ pageParam, signal }) => (history ? queryDownloadHistory : listDownloadTasks)(pageParam, signal),
    getNextPageParam: page => page.has_more ? { limit: 50, before_at_ms: page.next_at_ms, before_id: page.next_id, state, note_id: noteID, author_id: '' } : undefined,
    refetchInterval: live.connected ? false : q => q.state.data?.pages.some(page => page.items?.some(task => isActiveDownload(task.state))) ? 2000 : false,
  });
  const refresh = () => { void client.invalidateQueries({ queryKey: ['downloads'] }); void client.invalidateQueries({ queryKey: ['download-history'] }); };
  const action = useMutation({ mutationFn: ({ id, kind }: { id: string; kind: 'pause' | 'resume' | 'cancel' | 'retry' }) => ({ pause: pauseDownload, resume: resumeDownload, cancel: cancelDownload, retry: retryDownload })[kind](id),
    onSuccess: refresh, onError: (e: Error) => { void message.error(e.message); } });
  const open = useMutation({ mutationFn: openDownloadDirectory, onError: (e: Error) => { void message.error(e.message); } });
  const rows = query.data?.pages.flatMap(page => page.items ?? []).map(task => overlayProgress(task, live.tasks)) ?? [];
  return <div className="page">
    <div className="page-toolbar"><div><Typography.Title level={2} style={{ marginTop: 0 }}>{history ? '下载历史' : '下载任务'}</Typography.Title>
      <Typography.Text type="secondary">{history ? '一条笔记任务一条记录，成功、失败和复用结果可逐项查看。' : '并发处理多条笔记，每条笔记内的内容按顺序下载。'}</Typography.Text></div>
      <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()}>刷新</Button>
    </div>
    <Space style={{ marginBottom: 20 }}><Select style={{ width: 160 }} value={state} onChange={setState} options={[{ value: DownloadState.Unknown, label: '全部状态' }, ...Object.entries(states).filter(([key]) => Number(key) > 0).map(([key, value]) => ({ value: Number(key) as DownloadState, label: value.label }))]} />
      <Input.Search placeholder="按笔记 ID 过滤" allowClear onSearch={value => setNoteID(value.trim())} style={{ width: 320 }} /></Space>
    {query.isError && <Alert type="error" title={query.error.message} style={{ marginBottom: 16 }} />}
    <Card styles={{ body: { padding: 0 } }}><Table<DownloadTask> rowKey="id" dataSource={rows} loading={query.isPending} pagination={false} scroll={{ x: 1100 }} locale={{ emptyText: history ? '开始下载后，这里会保留笔记记录' : '在笔记详情中创建下载任务' }} columns={[
      { title: '笔记', width: 235, render: (_v: unknown, task) => <Space orientation="vertical" size={2}><Button type="link" className="note-title-link" onClick={() => setDetailID(task.id)}>{task.title || '无标题笔记'}</Button>
        {task.batch_id && <Tag style={{ fontSize: 10 }}>批量 {task.batch_id.slice(0, 6)}</Tag>}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{task.author_name || task.author_id}</Typography.Text></Space> },
      { title: '状态', width: 105, render: (_v: unknown, task) => <Tag color={states[task.state]?.color}>{states[task.state]?.label}</Tag> },
      { title: '进度', width: 240, render: (_v: unknown, task) => {
        const done = task.successful_items + task.skipped_items + task.failed_items;
        const fraction = task.current_total ? Math.min(task.current_bytes / task.current_total, 0.99) : 0;
        const percent = task.planned_items ? Math.min(100, (done + fraction) / task.planned_items * 100) : 0;
        return <div><Progress percent={Number(percent.toFixed(1))} size="small" showInfo={false} status={task.state === DownloadState.Running ? 'active' : task.state === DownloadState.Failed ? 'exception' : undefined} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{done}/{task.planned_items} 项 · {task.state === DownloadState.Running ? `当前 ${formatBytes(task.current_bytes)} / ${formatBytes(task.current_total)}` : `${task.successful_items} 成功 · ${task.skipped_items} 跳过 · ${task.failed_items} 失败`}</Typography.Text></div>;
      } },
      { title: '已覆盖', width: 100, render: (_v: unknown, task) => <Space orientation="vertical" size={2}><Typography.Text>{formatBytes(task.completed_bytes)}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 11 }}>{task.fulfilled_items}/{task.planned_items} 项已验证</Typography.Text></Space> },
      { title: '时间', width: 150, render: (_v: unknown, task) => <Typography.Text style={{ fontSize: 12 }}>{formatTime(history ? task.finished_at_ms || task.started_at_ms : task.created_at_ms)}</Typography.Text> },
      { title: '操作', width: 260, render: (_v: unknown, task) => <Space size={4} wrap>
        {[DownloadState.Queued, DownloadState.Running].includes(task.state) && <Button size="small" disabled={action.isPending} onClick={() => action.mutate({ id: task.id, kind: 'pause' })}>暂停</Button>}
        {[DownloadState.Paused, DownloadState.Interrupted].includes(task.state) && <Button size="small" disabled={action.isPending} onClick={() => action.mutate({ id: task.id, kind: 'resume' })}>恢复</Button>}
        {[DownloadState.Failed, DownloadState.Partial].includes(task.state) && <Button size="small" disabled={action.isPending} onClick={() => action.mutate({ id: task.id, kind: 'retry' })}>重试未完成项</Button>}
        {[DownloadState.Queued, DownloadState.Running, DownloadState.Paused, DownloadState.Interrupted].includes(task.state) && <Button size="small" danger disabled={action.isPending} onClick={() => modal.confirm({ title: '取消这条笔记的下载？', content: '已成功的文件保留。', okText: '取消下载', cancelText: '继续下载', onOk: () => action.mutateAsync({ id: task.id, kind: 'cancel' }) })}>取消</Button>}
        {history && <Button size="small" onClick={() => setRedownload(task)}>重新下载</Button>}
        <Button type="text" size="small" icon={<FolderOpenOutlined />} aria-label="打开笔记目录" onClick={() => open.mutate(task.id)} />
      </Space> },
    ]} /></Card>
    {query.hasNextPage && <div className="load-more"><Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>加载更多</Button></div>}
    <TaskDrawer id={detailID} onClose={() => setDetailID(null)} />
    {redownload && <CreateDownloadDrawer open onClose={() => setRedownload(null)} snapshotID={redownload.snapshot_id} title={redownload.title} initialConfig={redownload.config} force />}
  </div>;
}
