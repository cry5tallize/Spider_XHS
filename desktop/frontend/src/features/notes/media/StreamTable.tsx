import { useState } from 'react';
import { Button, Collapse, Modal, Space, Table, Tag, Typography } from 'antd';
import type { VideoStream } from '@/shared/contracts';
import { formatBytes } from '../labels';

export function StreamTable({ streams }: { streams: VideoStream[] }) {
  const [info, setInfo] = useState<VideoStream | null>(null);
  return <>
    <Table<VideoStream> size="small" rowKey={(stream, index) => `${stream.codec_group}:${index}`} dataSource={streams} pagination={false} scroll={{ x: 880 }}
      locale={{ emptyText: '响应没有提供视频流' }} columns={[
        { title: '规格', width: 190, render: (_v: unknown, stream, index) => <Space orientation="vertical" size={2}><Space size={4}><Typography.Text strong>{stream.width ?? '?'} × {stream.height ?? '?'}</Typography.Text>{index === 0 && <Tag color="blue">优先</Tag>}</Space>
          <Typography.Text type="secondary">{stream.stream_desc || stream.quality_type || '未命名规格'}</Typography.Text></Space> },
        { title: '编码', render: (_v: unknown, stream) => <Space orientation="vertical" size={2}><Typography.Text>{stream.codec_group} · {stream.codec || stream.video_codec || '未知'}</Typography.Text><Typography.Text type="secondary">{stream.format || '未知容器'}</Typography.Text></Space> },
        { title: '帧率', render: (_v: unknown, stream) => stream.fps != null ? `${stream.fps} FPS` : '—' },
        { title: '大小', render: (_v: unknown, stream) => formatBytes(stream.size_bytes) },
        { title: '码率', render: (_v: unknown, stream) => stream.average_bitrate != null ? `${(stream.average_bitrate / 1000).toFixed(0)} kbps` : '—' },
        { title: '备用地址', render: (_v: unknown, stream) => stream.backup_urls?.length ?? 0 },
        { title: '', width: 70, render: (_v: unknown, stream) => <Button type="link" size="small" onClick={() => setInfo(stream)}>详情</Button> },
      ]} expandable={{ expandedRowRender: stream => <div className="media-addresses"><Typography.Text type="secondary">主地址</Typography.Text>
        <Typography.Paragraph copyable className="media-url">{stream.url || stream.master_url || '未提供'}</Typography.Paragraph>
        {(stream.backup_urls ?? []).map((url, index) => <div key={url}><Typography.Text type="secondary">备用 {index + 1}</Typography.Text><Typography.Paragraph copyable className="media-url">{url}</Typography.Paragraph></div>)}
      </div> }} />
    <Modal title="视频流详细信息" open={info !== null} onCancel={() => setInfo(null)} footer={null} width={900} destroyOnHidden>
      {info && <Collapse items={[{ key: 'fields', label: '完整规格、来源与扩展字段', children: <pre className="json-view">{JSON.stringify(info, null, 2)}</pre> }]} defaultActiveKey={['fields']} />}
    </Modal>
  </>;
}
