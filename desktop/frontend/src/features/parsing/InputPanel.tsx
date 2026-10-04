import { useRef } from 'react';
import { Alert, App, Button, Card, Checkbox, Collapse, Form, Input, InputNumber, Select, Spin, Table, Tag, Typography } from 'antd';
import { ArrowRightOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { CollectionMode, CollectionState, AccountMode, CacheMode, LiveFilter, NoteKind, type CollectionConfig, type CollectionJob } from '@/shared/contracts';
import { startCollection, getCollectionDefaults, listCollections, listAccounts } from './api';
import { collectionActive, collectionStates } from './labels';
import { formatTime } from '@/features/notes/labels';

type Values = { text: string; account_id?: string; config: CollectionConfig; from?: string; until?: string };
function CollectionForm({ mode, defaults }: { mode: CollectionMode; defaults: CollectionConfig }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<Values>();
  const file = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: ({ signal }) => listAccounts(signal) });
  const accountMode = Form.useWatch(['config', 'account_mode'], form) ?? AccountMode.AccountFixed;
  const create = useMutation({ mutationFn: (values: Values) => {
    const config = { ...values.config, published_from_ms: values.from ? new Date(`${values.from}T00:00:00`).getTime() : 0,
      published_until_ms: values.until ? new Date(`${values.until}T23:59:59.999`).getTime() : 0 };
    return startCollection({ request_id: crypto.randomUUID(), mode, account_id: values.account_id || '', text: values.text, config });
  }, onSuccess: job => { void client.invalidateQueries({ queryKey: ['collections'] }); void navigate(`/parse/collections/${job.id}`); }, onError: (e: Error) => { void message.error(e.message); } });
  const available = accounts.data?.filter(account => account.enabled && account.has_cookie) ?? [];
  const importFile = async (selected?: File) => {
    if (!selected) return;
    try { if (selected.size > 1024 * 1024) throw new Error('文本文件不能超过 1 MiB'); const text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()); form.setFieldValue('text', text); }
    catch (e) { void message.error(e instanceof Error ? e.message : '无法读取 UTF-8 文本文件'); }
    finally { if (file.current) file.current.value = ''; }
  };
  return <Card><Form form={form} layout="vertical" initialValues={{ config: defaults }} onFinish={() => create.mutate(form.getFieldsValue(true))} disabled={create.isPending}>
    {accounts.isError && <Alert type="error" title={accounts.error.message} style={{ marginBottom: 16 }} />}
    <Form.Item name="text" label={mode === CollectionMode.ModeUsers ? '用户主页 / 用户 ID' : '笔记链接 / 分享文本'} rules={[{ required: true, whitespace: true, message: '请输入链接或 ID' }]} extra="每行一条，支持分享文本、完整链接和短链接；每批最多 1000 条输入。">
      <Input.TextArea rows={6} maxLength={1048576} autoComplete="off" placeholder={mode === CollectionMode.ModeUsers ? 'https://www.xiaohongshu.com/user/profile/...' : '粘贴多条笔记链接，重复笔记只解析一次'} />
    </Form.Item>
    <input type="file" ref={file} accept=".txt,text/plain" style={{ display: 'none' }} onChange={event => void importFile(event.target.files?.[0])} />
    <Button icon={<UploadOutlined />} onClick={() => file.current?.click()} style={{ marginBottom: 20 }}>导入 UTF-8 文本</Button>
    <div className="download-config-grid"><Form.Item name={['config', 'account_mode']} label="账号分配"><Select options={[{ value: AccountMode.AccountFixed, label: '固定账号' }, { value: AccountMode.AccountBySource, label: '按输入来源分配账号' }]} /></Form.Item>
      {accountMode === AccountMode.AccountFixed ? <Form.Item name="account_id" label="解析账号"><Select allowClear placeholder="使用默认账号" options={available.map(account => ({ value: account.id, label: account.name }))} /></Form.Item>
        : <Form.Item name={['config', 'account_ids']} label="账号池"><Select mode="multiple" placeholder="留空使用全部启用账号" options={available.map(account => ({ value: account.id, label: account.name }))} /></Form.Item>}
    </div>
    <Collapse style={{ marginBottom: 20 }} items={[{ key: 'config', label: '范围与筛选', children: <>
      <div className="download-config-grid"><Form.Item name={['config', 'max_pages']} label="每用户页数上限" rules={[{ required: true }]}><InputNumber min={1} max={10000} precision={0} style={{ width: '100%' }} disabled={mode !== CollectionMode.ModeUsers} /></Form.Item>
        <Form.Item name={['config', 'max_notes']} label="笔记数量上限（0 不限制）"><InputNumber min={0} max={100000} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name={['config', 'concurrency']} label="详情处理并发"><InputNumber min={1} max={16} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name={['config', 'cache_mode']} label="详情缓存"><Select options={[{ value: CacheMode.UseFresh, label: '优先使用最近 10 分钟缓存' }, { value: CacheMode.ForceRefresh, label: '重新请求详情' }, { value: CacheMode.CacheOnly, label: '只使用已有详情缓存' }]} /></Form.Item>
        <Form.Item name={['config', 'kind']} label="笔记类型"><Select options={[{ value: NoteKind.KindUnknown, label: '全部类型' }, { value: NoteKind.KindImage, label: '图文' }, { value: NoteKind.KindVideo, label: '视频' }]} /></Form.Item>
        <Form.Item name={['config', 'live_photo']} label="LivePhoto"><Select options={[{ value: LiveFilter.LiveAny, label: '全部' }, { value: LiveFilter.LiveOnly, label: '仅包含 LivePhoto' }, { value: LiveFilter.LiveExclude, label: '排除 LivePhoto' }]} /></Form.Item>
        <Form.Item name="from" label="发布起始日期"><Input type="date" /></Form.Item><Form.Item name="until" label="发布结束日期"><Input type="date" /></Form.Item>
      </div><Form.Item name={['config', 'title_keyword']} label="标题包含"><Input allowClear /></Form.Item>
      <Form.Item name={['config', 'save_raw']} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>保存原始详情响应</Checkbox></Form.Item>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>同一账号同时只请求一个接口。达到上限会明确提示；发布时间缺失时保留笔记，等待详情提供更多信息。</Typography.Paragraph>
    </> }]} />
    <Button type="primary" size="large" htmlType="submit" icon={<ArrowRightOutlined />} loading={create.isPending} disabled={!available.length}>开始{mode === CollectionMode.ModeUsers ? '用户' : '批量'}解析</Button>
  </Form></Card>;
}
export function InputPanel({ mode }: { mode: CollectionMode }) {
  const navigate = useNavigate();
  const config = useQuery({ queryKey: ['collection-defaults'], queryFn: ({ signal }) => getCollectionDefaults(signal), staleTime: Infinity });
  const jobs = useQuery({ queryKey: ['collections'], queryFn: ({ signal }) => listCollections(signal), staleTime: 0, refetchInterval: query => query.state.data?.some(job => collectionActive(job.state)) ? 1000 : false });
  return <>
    {config.isPending ? <Spin /> : config.isError ? <Alert type="error" title={config.error.message} /> : <CollectionForm mode={mode} defaults={config.data} />}
    <div className="section-toolbar"><Typography.Title level={4}>批量 / 用户作业</Typography.Title><Button onClick={() => void jobs.refetch()}>刷新</Button></div>
    <Card styles={{ body: { padding: 0 } }}><Table<CollectionJob> rowKey="id" dataSource={jobs.data ?? []} loading={jobs.isPending} pagination={{ pageSize: 10 }} columns={[
      { title: '作业', render: (_v: unknown, job) => <Button type="link" onClick={() => void navigate(`/parse/collections/${job.id}`)}>{job.mode === CollectionMode.ModeUsers ? '用户笔记' : '批量笔记'} · {job.source_count} 个来源</Button> },
      { title: '状态', render: (_v: unknown, job) => <Tag color={collectionStates[job.state]?.color}>{collectionStates[job.state]?.label}</Tag> },
      { title: '结果', render: (_v: unknown, job) => <Typography.Text>{job.completed} 完成 · {job.failed_items} 失败 · {job.skipped_items} 跳过 · {job.discovered} 已发现</Typography.Text> },
      { title: '时间', render: (_v: unknown, job) => formatTime(job.created_at_ms) },
      { title: '', render: (_v: unknown, job) => job.state === CollectionState.Limited ? <Typography.Text type="warning">仍可能有更多</Typography.Text> : null },
    ]} /></Card>
    {jobs.isError && <Alert type="error" title={jobs.error.message} style={{ marginTop: 16 }} />}
  </>;
}
