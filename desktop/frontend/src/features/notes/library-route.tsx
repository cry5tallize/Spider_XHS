import { Alert, Button, Card, Image, Space, Table, Tag, Typography } from 'antd';
import { LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { NoteSummary, NoteListInput } from '@/shared/contracts';
import { listNotes } from './api';
import { noteKindLabel, formatTime } from './labels';

export function Component() {
  const navigate = useNavigate();
  const notes = useInfiniteQuery({ queryKey: ['notes'], staleTime: 0, initialPageParam: { limit: 50, before_at_ms: 0, before_id: '' } as NoteListInput,
    queryFn: ({ pageParam, signal }) => listNotes(pageParam, signal),
    getNextPageParam: page => page.has_more ? { limit: 50, before_at_ms: page.next_at_ms, before_id: page.next_id } : undefined });
  return <div className="page">
    <div className="page-toolbar"><div><Typography.Title level={2} style={{ marginTop: 0 }}>笔记库</Typography.Title>
      <Typography.Text type="secondary">已解析笔记和媒体快照保存在本机，可随时查看全部候选。</Typography.Text></div>
      <Space><Button icon={<ReloadOutlined />} aria-label="刷新笔记" onClick={() => void notes.refetch()} /><Button type="primary" icon={<LinkOutlined />} onClick={() => void navigate('/parse')}>解析笔记</Button></Space>
    </div>
    {notes.isError && <Alert type="error" title={notes.error.message} style={{ marginBottom: 16 }} />}
    <Card styles={{ body: { padding: 0 } }}>
      <Table<NoteSummary> rowKey="id" dataSource={notes.data?.pages.flatMap(page => page.items ?? []) ?? []} loading={notes.isPending} pagination={false} scroll={{ x: 850 }}
        locale={{ emptyText: '解析后的笔记会显示在这里' }} columns={[
          { title: '笔记', width: 370, render: (_v: unknown, note) => <div className="note-summary"><Image src={note.cover_url || undefined} width={56} height={68} preview={false} referrerPolicy="no-referrer" style={{ objectFit: 'cover', borderRadius: 8 }} />
            <div><Button type="link" className="note-title-link" onClick={() => void navigate(`/notes/${note.id}`)}>{note.title || '无标题笔记'}</Button>
              <Typography.Text type="secondary" className="note-id">{note.id}</Typography.Text></div></div> },
          { title: '作者', dataIndex: 'author_name' },
          { title: '类型', render: (_v: unknown, note) => <Space size={0}><Tag>{noteKindLabel(note.kind)}</Tag>{note.has_live_photo && <Tag color="purple">LivePhoto</Tag>}</Space> },
          { title: '媒体', render: (_v: unknown, note) => <Space orientation="vertical" size={2}><Typography.Text>{note.image_count} 张图片 · {note.video_stream_count} 个视频流</Typography.Text>
            {note.motion_stream_count > 0 && <Typography.Text type="secondary">{note.motion_stream_count} 个动态流</Typography.Text>}</Space> },
          { title: '解析时间', render: (_v: unknown, note) => formatTime(note.fetched_at_ms) },
        ]} />
    </Card>
    {notes.hasNextPage && <div className="load-more"><Button loading={notes.isFetchingNextPage} onClick={() => void notes.fetchNextPage()}>加载更多</Button></div>}
  </div>;
}
