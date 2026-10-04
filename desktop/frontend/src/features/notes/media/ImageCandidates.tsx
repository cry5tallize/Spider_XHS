import { useState } from 'react';
import { Button, Card, Image, Modal, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { NoteImageInfo, ImageVariant } from '@/shared/contracts';
import { StreamTable } from './StreamTable';

export function ImageCandidates({ images }: { images: NoteImageInfo[] }) {
  const [info, setInfo] = useState<ImageVariant | null>(null);
  return <><Tabs type="card" destroyOnHidden items={images.map((image, index) => ({ key: String(index), label: <Space size={4}>图片 {index + 1}{(image.live_photo || image.motion_streams?.length) ? <Tag color="purple">Live</Tag> : null}</Space>,
    children: <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      <div className="image-candidate-heading"><Image src={image.variants?.[0]?.url} height={160} referrerPolicy="no-referrer" style={{ maxWidth: 260, objectFit: 'contain', borderRadius: 8 }} />
        <Space orientation="vertical" size={8}><Typography.Text strong>{image.width ?? '?'} × {image.height ?? '?'}</Typography.Text><Typography.Text type="secondary">{image.file_id || '未提供文件 ID'}</Typography.Text>
          <Typography.Text type="secondary">{image.variants?.length ?? 0} 个图片候选 · {image.motion_streams?.length ?? 0} 个动态流</Typography.Text></Space></div>
      <Table<ImageVariant> size="small" rowKey="url" pagination={false} dataSource={image.variants ?? []} scroll={{ x: 760 }} columns={[
        { title: 'Scene', width: 185, render: (_v: unknown, variant, order) => <Space size={4}><Typography.Text>{variant.scene || '未标注'}</Typography.Text>{order === 0 && <Tag color="blue">优先</Tag>}</Space> },
        { title: '格式', render: (_v: unknown, variant) => variant.format || '未知' },
        { title: '分辨率', render: (_v: unknown, variant) => `${variant.width ?? '?'} × ${variant.height ?? '?'}` },
        { title: '地址', render: (_v: unknown, variant) => <Typography.Paragraph copyable className="media-url compact-url">{variant.url}</Typography.Paragraph> },
        { title: '', width: 70, render: (_v: unknown, variant) => <Button type="link" size="small" onClick={() => setInfo(variant)}>详情</Button> },
      ]} />
      {!!image.motion_streams?.length && <Card size="small" title="LivePhoto 动态视频"><StreamTable streams={image.motion_streams} /></Card>}
    </Space>,
  }))} />
    <Modal title="图片候选详细信息" open={info !== null} onCancel={() => setInfo(null)} footer={null} width={850} destroyOnHidden>
      <pre className="json-view">{JSON.stringify(info, null, 2)}</pre>
    </Modal>
  </>;
}
