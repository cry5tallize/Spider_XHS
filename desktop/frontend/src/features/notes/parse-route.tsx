import { App, Alert, Button, Card, Form, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ArrowRightOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { ParseJob } from '@/shared/contracts';
import { startParse, listParseJobs, listAccounts, cancelParse } from './api';
import { isActiveParse, parseStates, formatTime } from './labels';

type Fields = { input: string; account_id?: string };
export function Component() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [form] = Form.useForm<Fields>();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: ({ signal }) => listAccounts(signal) });
  const jobs = useQuery({ queryKey: ['parse-jobs'], staleTime: 0, queryFn: ({ signal }) => listParseJobs(signal),
    refetchInterval: query => query.state.data?.some(job => isActiveParse(job.state)) ? 1000 : false });
  const refresh = () => { void client.invalidateQueries({ queryKey: ['parse-jobs'] }); void client.invalidateQueries({ queryKey: ['notes'] }); };
  const parse = useMutation({ mutationFn: (values: Fields) => startParse({ ...values, account_id: values.account_id || '', request_id: crypto.randomUUID() }),
    onSuccess: () => { refresh(); void message.success('已加入解析队列，可以切换页面'); }, onError: (err: Error) => { void message.error(err.message); } });
  const cancel = useMutation({ mutationFn: cancelParse, onSuccess: refresh, onError: (err: Error) => { void message.error(err.message); } });
  const available = accounts.data?.filter(account => account.enabled && account.has_cookie) ?? [];
  return <div className="page">
    <div className="page-toolbar"><div><Typography.Title level={2} style={{ marginTop: 0 }}>解析笔记</Typography.Title>
      <Typography.Text type="secondary">完整保留视频、图片与 LivePhoto 的媒体规格，解析结果自动保存到笔记库。</Typography.Text></div></div>
    {accounts.isError && <Alert type="error" title={accounts.error.message} style={{ marginBottom: 20 }} />}
    {!accounts.isPending && !available.length && <Alert type="info" title="先添加一个账号" description="在账号管理中填写 Cookie，然后回来解析笔记。"
      action={<Button onClick={() => void navigate('/accounts')}>账号管理</Button>} style={{ marginBottom: 20 }} />}
    <Card className="parse-input-card">
      <Form form={form} layout="vertical" onFinish={values => parse.mutate(values)}>
        <Form.Item name="input" label="笔记链接" rules={[{ required: true, whitespace: true, message: '请输入笔记链接或 ID' }]} extra="支持完整链接（包含 xsec_token / xsec_source）或 24 位 ID。">
          <Input size="large" prefix={<LinkOutlined />} placeholder="https://www.xiaohongshu.com/explore/..." autoComplete="off" maxLength={8192} />
        </Form.Item>
        <div className="parse-input-actions"><Form.Item name="account_id" label="解析账号" style={{ marginBottom: 0, minWidth: 260 }}>
          <Select placeholder="使用默认账号" allowClear options={available.map(account => ({ value: account.id, label: `${account.name}${account.is_default ? ' · 默认' : ''}` }))} />
        </Form.Item><Button type="primary" size="large" htmlType="submit" icon={<ArrowRightOutlined />} loading={parse.isPending} disabled={!available.length}>开始解析</Button></div>
      </Form>
    </Card>
    <div className="section-toolbar"><Typography.Title level={4}>最近解析</Typography.Title><Button type="text" icon={<ReloadOutlined />} onClick={() => void jobs.refetch()}>刷新</Button></div>
    {jobs.isError && <Alert type="error" title={jobs.error.message} style={{ marginBottom: 16 }} />}
    <Card styles={{ body: { padding: 0 } }}>
      <Table<ParseJob> rowKey="id" loading={jobs.isPending} dataSource={jobs.data ?? []} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 800 }} locale={{ emptyText: '粘贴一条笔记链接，开始整理' }} columns={[
        { title: '笔记', dataIndex: 'note_id', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
        { title: '账号', render: (_v: unknown, job) => accounts.data?.find(account => account.id === job.account_id)?.name || '已删除账号' },
        { title: '状态', render: (_v: unknown, job) => <Space orientation="vertical" size={2}><Tag color={parseStates[job.state]?.color}>{parseStates[job.state]?.label}</Tag>
          {job.failure && <Typography.Text type="danger" style={{ fontSize: 12 }}>{job.failure.message}</Typography.Text>}</Space> },
        { title: '创建时间', render: (_v: unknown, job) => formatTime(job.created_at_ms) },
        { title: '', width: 105, render: (_v: unknown, job) => job.snapshot_id ? <Button size="small" onClick={() => void navigate(`/notes/${job.note_id}?snapshot=${job.snapshot_id}`)}>查看笔记</Button>
          : isActiveParse(job.state) ? <Button size="small" loading={cancel.isPending && cancel.variables === job.id} onClick={() => cancel.mutate(job.id)}>取消</Button> : null },
      ]} />
    </Card>
  </div>;
}
