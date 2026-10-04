import { useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Drawer, Form, Input, InputNumber, Select, Space, Spin, Table, Typography } from 'antd';
import { FolderOpenOutlined, DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { DownloadConfig, DownloadPlan } from '@/shared/contracts';
import { DedupMode, ExistingPolicy } from '@/shared/contracts';
import { chooseOutputDirectory } from '@/shared/bridge';
import { getDownloadDefaults, buildDownloadPlan, createDownloadTask } from './api';
import { mediaLabels } from './labels';

type Props = { open: boolean; onClose: () => void; snapshotID: string; title: string; initialConfig?: DownloadConfig; force?: boolean };
function DownloadForm({ snapshotID, defaults, onClose }: { snapshotID: string; defaults: DownloadConfig; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DownloadConfig>();
  const [plan, setPlan] = useState<DownloadPlan | null>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const preview = useMutation({ mutationFn: (config: DownloadConfig) => buildDownloadPlan(snapshotID, config), onSuccess: setPlan, onError: (e: Error) => { void message.error(e.message); } });
  const create = useMutation({ mutationFn: () => {
    if (!plan) throw new Error('请先预览计划');
    return createDownloadTask({ request_id: crypto.randomUUID(), snapshot_id: snapshotID, config: plan.config });
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['downloads'] }); void message.success('已创建笔记下载任务'); onClose(); void navigate('/downloads'); }, onError: (e: Error) => { void message.error(e.message); } });
  const choose = async () => { try { const directory = await chooseOutputDirectory(); if (directory) { form.setFieldValue(['output', 'directory'], directory); setPlan(null); } } catch (e) { void message.error(e instanceof Error ? e.message : '目录选择失败'); } };
  return <Form form={form} layout="vertical" initialValues={defaults} onValuesChange={() => setPlan(null)} onFinish={() => preview.mutate(form.getFieldsValue(true))} disabled={create.isPending}>
    <Typography.Paragraph type="secondary">默认选取每个媒体的首个可用候选。每条笔记内按顺序下载，LivePhoto 保留静态图与动态视频。</Typography.Paragraph>
    <Card size="small" title="保存内容" style={{ marginBottom: 20 }}>
      <div className="download-media-options">{([
        ['video', '主视频'], ['images', '图片 / LivePhoto 静态图'], ['live_photo_motion', 'LivePhoto 动态视频'], ['video_cover', '视频封面'],
        ['pretty', '笔记 JSON'], ['text', '笔记文本'], ['raw', '原始响应'], ['manifest', '结果清单'],
      ] as const).map(([key, label]) => <Form.Item key={key} name={['media', key]} valuePropName="checked" style={{ marginBottom: 8 }}><Checkbox>{label}</Checkbox></Form.Item>)}</div>
    </Card>
    <Form.Item label="下载目录" required><Space.Compact style={{ width: '100%' }}>
      <Form.Item name={['output', 'directory']} noStyle rules={[{ required: true, message: '请选择下载目录' }]}><Input placeholder="选择一个本地目录" /></Form.Item>
      <Button icon={<FolderOpenOutlined />} onClick={() => void choose()}>选择</Button></Space.Compact>
    </Form.Item>
    <div className="download-config-grid"><Form.Item name={['output', 'existing_policy']} label="已有文件"><Select options={[{ value: ExistingPolicy.Overwrite, label: '覆盖（新文件完成后替换）' }, { value: ExistingPolicy.SkipExisting, label: '跳过已存在文件' }]} /></Form.Item>
      <Form.Item name={['dedup', 'mode']} label="历史过滤"><Select options={[{ value: DedupMode.SameOutput, label: '同目录有效文件：跳过已下载项' }, { value: DedupMode.DedupOff, label: '关闭历史过滤' }]} /></Form.Item>
      <Form.Item name={['execution', 'retries_per_url']} label="每地址额外重试次数"><InputNumber min={0} max={5} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name={['execution', 'max_attempts']} label="每个文件总尝试上限"><InputNumber min={1} max={64} style={{ width: '100%' }} /></Form.Item>
    </div>
    <Space orientation="vertical" style={{ marginBottom: 20 }}>
      <Form.Item name={['dedup', 'force']} valuePropName="checked" noStyle><Checkbox>忽略历史过滤，重新下载</Checkbox></Form.Item>
      <Form.Item name={['dedup', 'strict_hash']} valuePropName="checked" noStyle><Checkbox>复用前完整校验 SHA-256</Checkbox></Form.Item>
      <Form.Item name={['execution', 'continue_on_error']} valuePropName="checked" noStyle><Checkbox>当前文件失败后继续后续内容</Checkbox></Form.Item>
    </Space>
    <div className="download-plan-actions"><Button htmlType="submit" loading={preview.isPending}>预览下载计划</Button>
      <Button type="primary" icon={<DownloadOutlined />} disabled={!plan || preview.isPending} loading={create.isPending} onClick={() => create.mutate()}>创建笔记任务</Button></div>
    {plan && <div style={{ marginTop: 24 }}>
      {!!plan.warnings?.length && <Alert type="warning" title="部分内容不可用" description={plan.warnings.join('；')} style={{ marginBottom: 16 }} />}
      <Typography.Paragraph type="secondary">共 {plan.items?.length ?? 0} 项 · 按作者和笔记分目录</Typography.Paragraph>
      <Table size="small" rowKey="sequence" pagination={false} dataSource={plan.items ?? []} columns={[
        { title: '#', dataIndex: 'sequence', width: 45 }, { title: '内容', render: (_v: unknown, item) => mediaLabels[item.kind] },
        { title: '规格', render: (_v: unknown, item) => [item.representation.codec_group, item.representation.scene, item.representation.width && `${item.representation.width}×${item.representation.height ?? '?'}`].filter(Boolean).join(' · ') || '—' },
        { title: '文件', render: (_v: unknown, item) => <Typography.Text style={{ fontSize: 12 }} ellipsis={{ tooltip: item.relative_path }}>{item.relative_path.split(/[\\/]/).at(-1)}</Typography.Text> },
      ]} />
    </div>}
  </Form>;
}
export function CreateDownloadDrawer(props: Props) {
  const defaults = useQuery({ queryKey: ['download-defaults'], queryFn: ({ signal }) => getDownloadDefaults(signal), enabled: props.open, staleTime: 0 });
  const config = props.initialConfig || defaults.data;
  const initial = config && props.force ? { ...config, dedup: { ...config.dedup, force: true } } : config;
  return <Drawer title={`下载 · ${props.title || '无标题笔记'}`} open={props.open} onClose={props.onClose} size={780} destroyOnHidden>
    {props.open && (initial ? <DownloadForm key={props.snapshotID} snapshotID={props.snapshotID} defaults={initial} onClose={props.onClose} />
      : defaults.isError ? <Alert type="error" title={defaults.error.message} /> : <Spin />)}
  </Drawer>;
}
