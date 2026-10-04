import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Progress, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { CollectionState, CollectionItemState, type CollectionItem, type CollectionItemQuery, type CollectionSource } from '@/shared/contracts';
import { CreateDownloadDrawer } from '@/features/downloads/CreateDrawer';
import { getCollection, getCollectionItems, getCollectionSources, getCollectionOrigins, pauseCollection, cancelCollection, resumeCollection, retryCollection, listAccounts } from './api';
import { collectionActive, collectionStates, collectionItemLabels, sourceLabels } from './labels';

function Origins({ id }: { id: string }) {
  const data = useQuery({ queryKey: ['collection-origins', id], queryFn: ({ signal }) => getCollectionOrigins(id, signal) });
  return <Space wrap>{data.data?.map((origin, index) => <Tag key={index}>输入 #{origin.index} · {origin.target_id || '短链接'} · {origin.pages} 页</Tag>)}{data.error?.message}</Space>;
}
export function Component() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [tab, setTab] = useState('items');
  const [selected, setSelected] = useState<CollectionItem[]>([]);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: ({ signal }) => listAccounts(signal) });
  const job = useQuery({ queryKey: ['collection', id], queryFn: ({ signal }) => getCollection(id, signal), staleTime: 0, refetchInterval: q => q.state.data && collectionActive(q.state.data.state) ? 1000 : false });
  const active = job.data && collectionActive(job.data.state);
	const jobRevision=job.data?.revision;
	const jobState=job.data?.state;
  const items = useInfiniteQuery({ queryKey: ['collection-items', id], initialPageParam: { job_id: id, limit: 50, after_ordinal: 0, state: 0 } as CollectionItemQuery,
    queryFn: ({ pageParam, signal }) => getCollectionItems(pageParam, signal), getNextPageParam: page => page.has_more ? { job_id: id, limit: 50, after_ordinal: page.next_ordinal, state: 0 } : undefined, staleTime: 0, refetchInterval: active && tab === 'items' ? 1500 : false });
  const sources = useQuery({ queryKey: ['collection-sources', id], queryFn: ({ signal }) => getCollectionSources(id, signal), staleTime: 0, refetchInterval: active && tab === 'sources' ? 1500 : false });
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ['collection-items', id] });
    void client.invalidateQueries({ queryKey: ['collection-sources', id] });
    if (jobState !== undefined && !collectionActive(jobState)) void client.invalidateQueries({ queryKey: ['notes'] });
  }, [client, id, jobRevision, jobState]);
  const action = useMutation({ mutationFn: (kind: 'pause' | 'cancel' | 'resume' | 'retry') => ({ pause: pauseCollection, cancel: cancelCollection, resume: resumeCollection, retry: retryCollection })[kind](id),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['collection', id] }); void client.invalidateQueries({ queryKey: ['collections'] }); }, onError: (e: Error) => { void message.error(e.message); } });
  if (job.isError) return <div className="page"><Alert type="error" title={job.error.message} /></div>;
  const result = job.data;
  const finished = result ? result.completed + result.failed_items + result.skipped_items : 0;
  const accountName = (id: string) => accounts.data?.find(account => account.id === id)?.name || id;
  return <div className="page">
    <div className="page-toolbar"><div><Button type="text" onClick={() => void navigate('/parse')}>返回解析</Button><Typography.Title level={2}>解析作业</Typography.Title></div>
      <Space><Button type="primary" disabled={!selected.length || selected.length > 200} onClick={() => setDownloadOpen(true)}>下载已选 {selected.length || ''} 笔记</Button>{active && <Button disabled={action.isPending} onClick={() => action.mutate('pause')}>暂停</Button>}
        {result && [CollectionState.Paused, CollectionState.Interrupted].includes(result.state) && <Button onClick={() => action.mutate('resume')} disabled={action.isPending}>继续</Button>}
        {result && [CollectionState.Partial, CollectionState.Failed, CollectionState.Paused].includes(result.state) && <Button onClick={() => action.mutate('retry')} disabled={action.isPending}>重试失败项</Button>}
        {result && [CollectionState.Queued, CollectionState.Running, CollectionState.Paused, CollectionState.Interrupted].includes(result.state) && <Button danger disabled={action.isPending} onClick={() => modal.confirm({ title: '取消解析？', content: '已成功的笔记和快照保留。', okText: '取消解析', cancelText: '继续', onOk: () => action.mutateAsync('cancel') })}>取消</Button>}
      </Space></div>
    {result && <Card style={{ marginBottom: 20 }}><Space><Tag color={collectionStates[result.state]?.color}>{collectionStates[result.state]?.label}</Tag><Typography.Text>{result.completed} 完成 · {result.failed_items} 失败 · {result.skipped_items} 跳过 · {result.discovered} 已发现</Typography.Text></Space>
      <Progress percent={result.discovered ? Math.round(finished / result.discovered * 100) : 0} showInfo={false} status={active ? 'active' : undefined} />
      <Typography.Text type="secondary">发现过程仍可能增加总数，百分比仅针对已发现笔记。</Typography.Text>
      {(result.limit_reason || result.failure) && <Alert style={{ marginTop: 16 }} type="warning" title={result.limit_reason || result.failure?.message} />}
    </Card>}
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'items', label: '笔记结果', children: <><Card styles={{ body: { padding: 0 } }}><Table<CollectionItem> rowKey="id" loading={items.isPending} pagination={false} dataSource={items.data?.pages.flatMap(page => page.items ?? []) ?? []} scroll={{ x: 900 }} rowSelection={{ selectedRowKeys: selected.map(item => item.id), preserveSelectedRowKeys: true, onChange: (_keys, rows) => setSelected(rows.filter(Boolean)), getCheckboxProps: item => ({ disabled: !item.snapshot_id || ![CollectionItemState.Complete, CollectionItemState.Incomplete].includes(item.state) }) }} columns={[
        { title: '笔记', render: (_v: unknown, item) => <Space orientation="vertical" size={2}><Typography.Text strong>{item.title || item.note_id}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 11 }}>{item.note_id}</Typography.Text></Space> },
        { title: '类型', dataIndex: 'raw_kind' }, { title: '账号', render: (_v: unknown, item) => accountName(item.account_id) },
        { title: '状态', render: (_v: unknown, item) => <Space orientation="vertical" size={2}><Typography.Text>{collectionItemLabels[item.state]}</Typography.Text><Typography.Text type={item.failure ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{item.failure?.message || item.skip_reason}</Typography.Text></Space> },
        { title: '来源', dataIndex: 'origin_count', width: 60 }, { title: '', width: 90, render: (_v: unknown, item) => item.snapshot_id && <Button size="small" onClick={() => void navigate(`/notes/${item.note_id}?snapshot=${item.snapshot_id}`)}>查看</Button> },
      ]} expandable={{ expandedRowRender: item => <Origins id={item.id} /> }} /></Card>
        {items.hasNextPage && <div className="load-more"><Button loading={items.isFetchingNextPage} onClick={() => void items.fetchNextPage()}>加载更多</Button></div>}
        {items.isError && <Alert type="error" title={items.error.message} />}</> },
      { key: 'sources', label: '输入与用户分页', children: <Card styles={{ body: { padding: 0 } }}><Table<CollectionSource> rowKey="id" loading={sources.isPending} dataSource={sources.data ?? []} pagination={{ pageSize: 20 }} columns={[
        { title: '#', dataIndex: 'index', width: 45 }, { title: '目标', render: (_v: unknown, source) => source.user_name || source.target_id || '等待展开链接' },
        { title: '账号', render: (_v: unknown, source) => accountName(source.account_id) }, { title: '状态', render: (_v: unknown, source) => sourceLabels[source.state] }, { title: '已提交页数', dataIndex: 'pages' },
        { title: '说明', render: (_v: unknown, source) => <Typography.Text type={source.failure ? 'danger' : 'secondary'}>{source.failure?.message || source.limit_reason || (source.has_more ? '还有待发现内容' : '已完成发现')}</Typography.Text> },
      ]} /></Card> },
    ]} />
    <CreateDownloadDrawer open={downloadOpen} onClose={() => setDownloadOpen(false)} snapshotID="" batchSnapshotIDs={selected.map(item => item.snapshot_id)} title={`已选 ${selected.length} 条笔记`} />
  </div>;
}
