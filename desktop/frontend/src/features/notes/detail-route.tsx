import { useState } from 'react';
import { Alert, App, Button, Card, Collapse, Descriptions, Empty, Modal, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CopyOutlined, FileTextOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { getNote, getSnapshot, listSnapshots, getRawSnapshot } from './api';
import { formatTime } from './labels';
import { StreamTable } from './media/StreamTable';
import { ImageCandidates } from './media/ImageCandidates';
import { CreateDownloadDrawer } from '@/features/downloads/CreateDrawer';

function RawResponse({ id }: { id: string }) {
  const { message } = App.useApp();
  const raw = useQuery({ queryKey: ['note-raw', id], queryFn: ({ signal }) => getRawSnapshot(id, signal), gcTime: 0 });
  if (raw.isPending) return <Spin />;
  if (raw.isError) return <Alert type="error" title={raw.error.message} />;
  return <><Button icon={<CopyOutlined />} onClick={() => { void navigator.clipboard.writeText(raw.data).then(() => message.success('原始响应已复制')).catch(() => message.error('复制失败')); }}>复制原始响应</Button>
    <pre className="json-view">{raw.data}</pre></>;
}

export function Component() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const snapshotID = params.get('snapshot') || '';
  const [rawOpen, setRawOpen] = useState(false);
  const [prettyOpen, setPrettyOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const result = useQuery({ queryKey: ['note-detail', id, snapshotID], staleTime: snapshotID ? Infinity : 0, queryFn: ({ signal }) => snapshotID ? getSnapshot(snapshotID, signal) : getNote(id, signal) });
  const snapshots = useQuery({ queryKey: ['note-snapshots', id], staleTime: 0, queryFn: ({ signal }) => listSnapshots(id, signal) });
  if (result.isPending) return <div className="page"><Spin /></div>;
  if (result.isError) return <div className="page"><Alert type="error" title={result.error.message} action={<Button onClick={() => void result.refetch()}>重试</Button>} /></div>;
  const { note, snapshot } = result.data;
  const warnings = snapshot.warnings ?? [];
  return <div className="page note-detail-page">
    <div className="page-toolbar"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => void navigate('/notes')}>笔记库</Button>
      <Space><Button icon={<FileTextOutlined />} onClick={() => setPrettyOpen(true)}>Pretty 数据</Button><Button onClick={() => setRawOpen(true)}>原始响应</Button><Button type="primary" icon={<DownloadOutlined />} onClick={() => setDownloadOpen(true)}>下载笔记</Button></Space>
    </div>
    <Typography.Title level={2} style={{ marginTop: 0 }}>{note.title || '无标题笔记'}</Typography.Title>
    <Space wrap style={{ marginBottom: 20 }}><Tag color="blue">{note.type === 'video' ? '视频笔记' : note.type === 'normal' ? '图文笔记' : note.type}</Tag>
      {note.has_live_photo && <Tag color="purple">包含 LivePhoto</Tag>}<Typography.Text>{note.user.nickname || '未知作者'}</Typography.Text>
      <Typography.Text type="secondary">{formatTime(note.created_at_ms)}</Typography.Text><Typography.Text code copyable>{note.id}</Typography.Text></Space>
    <Typography.Paragraph className="note-description">{note.description}</Typography.Paragraph>
    {!!note.tags?.length && <Space wrap style={{ marginBottom: 20 }}>{note.tags.map((tag, index) => <Tag key={`${tag.id}:${index}`}>#{tag.name}</Tag>)}</Space>}
    <Card size="small" className="snapshot-card">
      <div className="snapshot-toolbar"><Space orientation="vertical" size={2}><Typography.Text strong>媒体快照</Typography.Text>
        <Typography.Text type="secondary">{formatTime(snapshot.fetched_at_ms)} · 解析器 v{snapshot.parser_version} · Cookie v{snapshot.credential_version || '—'}</Typography.Text></Space>
        <Select style={{ minWidth: 280 }} value={snapshotID} onChange={value => { setRawOpen(false); setPrettyOpen(false); setParams(value ? { snapshot: value } : {}); }}
          options={[{ value: '', label: '当前快照' }, ...(snapshots.data ?? []).map(item => ({ value: item.id, label: `${formatTime(item.fetched_at_ms)} · ${item.id.slice(0, 8)}` }))]} />
      </div>
      {snapshots.isError && <Alert type="warning" title="无法读取快照列表" description={snapshots.error.message} style={{ marginTop: 12 }} />}
    </Card>
    {!!warnings.length && <Collapse style={{ marginBottom: 20 }} items={[{ key: 'warnings', label: `部分字段解析警告（${warnings.length}）`, children: <Space orientation="vertical">{warnings.map((warning, index) => <Typography.Text key={index} type="warning">{warning}</Typography.Text>)}</Space> }]} />}
    <Tabs destroyOnHidden items={[
      { key: 'media', label: '媒体候选', children: <Space orientation="vertical" size={24} style={{ width: '100%' }}>
        {note.video && <Card title={`笔记视频 · ${note.video.streams?.length ?? 0} 个流`}>
          <Descriptions size="small" column={3} style={{ marginBottom: 20 }} items={[
            { key: 'id', label: '视频 ID', children: note.video.video_id || '—' },
            { key: 'duration', label: '时长', children: note.video.metadata.duration_sec != null ? `${note.video.metadata.duration_sec} 秒` : '—' },
            { key: 'dimensions', label: '原始尺寸', children: `${note.video.metadata.width ?? '?'} × ${note.video.metadata.height ?? '?'}` },
          ]} /><StreamTable streams={note.video.streams ?? []} />
        </Card>}
        {!!note.images?.length && <Card title={`图片 · ${note.images.length} 张`}><ImageCandidates images={note.images} /></Card>}
        {!note.video && !note.images?.length && <Empty description="响应没有提供媒体候选，请检查账号权限" />}
      </Space> },
      { key: 'info', label: '笔记信息', children: <Card><Descriptions column={2} items={[
        { key: 'author', label: '作者 ID', children: note.user.id || '—' },
        { key: 'type', label: '上游类型', children: note.type },
        { key: 'created', label: '发布时间', children: formatTime(note.created_at_ms) },
        { key: 'updated', label: '修改时间', children: formatTime(note.updated_at_ms) },
        { key: 'likes', label: '点赞', children: note.interactions.likes ?? '—' },
        { key: 'collections', label: '收藏', children: note.interactions.collections ?? '—' },
        { key: 'comments', label: '评论', children: note.interactions.comments ?? '—' },
        { key: 'shares', label: '分享', children: note.interactions.shares ?? '—' },
        { key: 'location', label: 'IP 位置', children: note.ip_location || '—' },
        { key: 'account', label: '解析账号 ID', children: snapshot.account_id || '离线导入' },
        { key: 'hash', label: '原文 SHA-256', span: 2, children: <Typography.Text code copyable>{snapshot.raw_sha256}</Typography.Text> },
      ]} /></Card> },
    ]} />
    <Modal title="原始响应" open={rawOpen} onCancel={() => setRawOpen(false)} footer={null} width={1000} destroyOnHidden>
      {rawOpen && <RawResponse id={snapshot.id} />}
    </Modal>
    <Modal title="完整 Pretty 数据" open={prettyOpen} onCancel={() => setPrettyOpen(false)} footer={null} width={1000} destroyOnHidden>
      <pre className="json-view">{JSON.stringify(result.data, null, 2)}</pre>
    </Modal>
    <CreateDownloadDrawer open={downloadOpen} onClose={() => setDownloadOpen(false)} snapshotID={snapshot.id} title={note.title} />
  </div>;
}
