import { useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Drawer, Form, Input, InputNumber, Select, Space, Spin, Table, Typography, Modal } from 'antd';
import { FolderOpenOutlined, DownloadOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { DownloadConfig, DownloadPlan } from '@/shared/contracts';
import { DedupMode, ExistingPolicy, VideoMode, ImageMode, LiveMode } from '@/shared/contracts';
import { chooseOutputDirectory } from '@/shared/bridge';
import { getDownloadDefaults, buildDownloadPlan, buildDownloadPlans, createDownloadTask, createDownloadBatch, listDownloadPresets, saveDownloadPreset, deleteDownloadPreset } from './api';
import { mediaLabels } from './labels';
import { SelectionFields } from './SelectionFields';

type Props = { open: boolean; onClose: () => void; snapshotID: string; batchSnapshotIDs?: string[]; title: string; initialConfig?: DownloadConfig; force?: boolean };
function DownloadForm({ snapshotID, batchSnapshotIDs, defaults, onClose }: { snapshotID: string; batchSnapshotIDs?: string[]; defaults: DownloadConfig; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DownloadConfig>();
  const [plans, setPlans] = useState<DownloadPlan[] | null>(null);
  const [presetID, setPresetID] = useState<string | undefined>();
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [keepDirectory, setKeepDirectory] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const presets = useQuery({ queryKey: ['download-presets'], queryFn: ({ signal }) => listDownloadPresets(signal), staleTime: 0 });
  const preview = useMutation({ mutationFn: async (config: DownloadConfig) => ({ key: JSON.stringify(config), plans: batchSnapshotIDs ? await buildDownloadPlans(batchSnapshotIDs, config) : [await buildDownloadPlan(snapshotID, config)] }), onSuccess: result => { if (result.key === JSON.stringify(form.getFieldsValue(true))) setPlans(result.plans); }, onError: (e: Error) => { void message.error(e.message); } });
  const create = useMutation({ mutationFn: async () => {
    if (!plans?.length) throw new Error('请先预览计划');
    if (batchSnapshotIDs) await createDownloadBatch({ request_id: crypto.randomUUID(), snapshot_ids: batchSnapshotIDs, config: plans[0].config });
    else await createDownloadTask({ request_id: crypto.randomUUID(), snapshot_id: snapshotID, config: plans[0].config });
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['downloads'] }); void message.success('已创建笔记下载任务'); onClose(); void navigate('/downloads'); }, onError: (e: Error) => { void message.error(e.message); } });
  const savePreset = useMutation({ mutationFn: () => { const config = structuredClone(form.getFieldsValue(true)); if (!keepDirectory) config.output.directory = ''; return saveDownloadPreset({ id: '', name: presetName, config }); }, onSuccess: () => { setSaveOpen(false); setPresetName(''); void client.invalidateQueries({ queryKey: ['download-presets'] }); void message.success('预设已保存'); }, onError: (e: Error) => { void message.error(e.message); } });
  const removePreset = useMutation({ mutationFn: deleteDownloadPreset, onSuccess: () => { setPresetID(undefined); void client.invalidateQueries({ queryKey: ['download-presets'] }); }, onError: (e: Error) => { void message.error(e.message); } });
  const applyPreset = (id: string) => { const preset = presets.data?.find(value => value.id === id); if (!preset) return; const config = structuredClone(preset.config); if (!config.output.directory) config.output.directory = defaults.output.directory; form.setFieldsValue(config); setPresetID(id); setPlans(null); };
  const choose = async () => { try { const directory = await chooseOutputDirectory(); if (directory) { form.setFieldValue(['output', 'directory'], directory); setPlans(null); } } catch (e) { void message.error(e instanceof Error ? e.message : '目录选择失败'); } };
  return <><Form form={form} layout="vertical" initialValues={defaults} onValuesChange={() => setPlans(null)} onFinish={() => preview.mutate(form.getFieldsValue(true))} disabled={create.isPending}>
    <Typography.Paragraph type="secondary">按编码、分辨率、Scene 或具体候选选择内容。每条笔记内按顺序下载，LivePhoto 静态与动态记录在配对清单中。</Typography.Paragraph>
    <Space.Compact style={{ width: '100%', marginBottom: 20 }}><Select style={{ flex: 1 }} allowClear value={presetID} onChange={id => { if (id) applyPreset(id); else setPresetID(undefined); }} placeholder="使用已保存的下载预设" options={presets.data?.map(preset => ({ value: preset.id, label: preset.name }))} />
      <Button icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>保存预设</Button><Button icon={<DeleteOutlined />} disabled={!presetID} onClick={() => { if (presetID) removePreset.mutate(presetID); }} aria-label="删除预设" /></Space.Compact>
    <Card size="small" title="保存内容" style={{ marginBottom: 20 }}>
      <div className="download-media-options">{([
        ['video', '主视频'], ['images', '图片 / LivePhoto 静态图'], ['live_photo_motion', 'LivePhoto 动态视频'], ['video_cover', '视频封面'],
        ['pretty', '笔记 JSON'], ['text', '笔记文本'], ['raw', '原始响应'], ['manifest', '结果清单'],
      ] as const).map(([key, label]) => <Form.Item key={key} name={['media', key]} valuePropName="checked" style={{ marginBottom: 8 }}><Checkbox>{label}</Checkbox></Form.Item>)}</div>
    </Card>
    <SelectionFields snapshotID={snapshotID} batch={!!batchSnapshotIDs} />
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
      <Button type="primary" icon={<DownloadOutlined />} disabled={!plans || preview.isPending} loading={create.isPending} onClick={() => create.mutate()}>创建{plans && plans.length > 1 ? `${plans.length} 条` : ''}笔记任务</Button></div>
    {plans?.map(plan => <div style={{ marginTop: 24 }} key={plan.snapshot_id}>
      {!!plan.warnings?.length && <Alert type="warning" title="部分内容不可用" description={plan.warnings.join('；')} style={{ marginBottom: 16 }} />}
      <Typography.Paragraph type="secondary">{plans.length > 1 ? `${plan.title || plan.note_id} · ` : ''}共 {plan.items?.length ?? 0} 项 · {plan.relative_directory}</Typography.Paragraph>
      <Table size="small" rowKey="sequence" pagination={{ pageSize: 15, hideOnSinglePage: true }} dataSource={plan.items ?? []} columns={[
        { title: '#', dataIndex: 'sequence', width: 45 }, { title: '内容', render: (_v: unknown, item) => mediaLabels[item.kind] },
        { title: '规格', render: (_v: unknown, item) => [item.representation.codec_group, item.representation.scene, item.representation.width && `${item.representation.width}×${item.representation.height ?? '?'}`].filter(Boolean).join(' · ') || '—' },
        { title: '文件', render: (_v: unknown, item) => <Typography.Text style={{ fontSize: 12 }} ellipsis={{ tooltip: item.relative_path }}>{item.relative_path.split(/[\\/]/).at(-1)}</Typography.Text> },
      ]} />
    </div>)}
  </Form><Modal title="保存下载预设" open={saveOpen} onCancel={() => setSaveOpen(false)} onOk={() => savePreset.mutate()} confirmLoading={savePreset.isPending} okText="保存" cancelText="取消">
    <Input value={presetName} onChange={event => setPresetName(event.target.value)} placeholder="预设名称，例如全部规格" style={{ marginBottom: 16 }} /><Checkbox checked={keepDirectory} onChange={event => setKeepDirectory(event.target.checked)}>将当前下载目录一并保存</Checkbox>
    <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>未勾选时继承设置页的下载目录。自选候选属于具体笔记，请将自动选择或规格筛选保存为通用预设。</Typography.Paragraph></Modal></>;
}
export function CreateDownloadDrawer(props: Props) {
  const defaults = useQuery({ queryKey: ['download-defaults'], queryFn: ({ signal }) => getDownloadDefaults(signal), enabled: props.open, staleTime: 0 });
  const config = props.initialConfig || defaults.data;
  const normalized = config && { ...config, selection: { ...config.selection, video: { ...config.selection.video, mode: config.selection.video.mode || VideoMode.VideoBest }, images: { ...config.selection.images, mode: config.selection.images.mode || ImageMode.ImageBest }, live_photo: config.selection.live_photo || LiveMode.LiveBoth } };
  const initial = normalized && props.force ? { ...normalized, dedup: { ...normalized.dedup, force: true } } : normalized;
  return <Drawer title={`下载 · ${props.title || '无标题笔记'}`} open={props.open} onClose={props.onClose} size={780} destroyOnHidden>
    {props.open && (initial ? <DownloadForm key={props.batchSnapshotIDs?.join(',') || props.snapshotID} snapshotID={props.snapshotID} batchSnapshotIDs={props.batchSnapshotIDs} defaults={initial} onClose={props.onClose} />
      : defaults.isError ? <Alert type="error" title={defaults.error.message} /> : <Spin />)}
  </Drawer>;
}
