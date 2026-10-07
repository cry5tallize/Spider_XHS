import { Alert, Descriptions, Drawer, Empty, Space, Spin, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ItemState, SkipReason } from '@/shared/contracts';
import { getDownloadTask, listDownloadItems } from './api';
import { states, itemLabels, mediaLabels } from './labels';
import { useDownloadProgress, overlayProgress } from './progress-store';
import { formatBytes, formatTime } from '@/features/notes/labels';

function Contents({ id }: { id: string }) {
  const live = useDownloadProgress();
  const detail = useQuery({
    queryKey: ['download-task', id],
    queryFn: ({ signal }) => getDownloadTask(id, signal),
    staleTime: 0,
  });
  const items = useQuery({
    queryKey: ['download-items', id],
    queryFn: ({ signal }) => listDownloadItems(id, signal),
    staleTime: 0,
  });
  if (detail.isPending || items.isPending) return <Spin />;
  if (detail.isError || items.isError)
    return <Alert type="error" title={detail.error?.message || items.error?.message} />;
  const task = overlayProgress(detail.data, live.tasks);
  return (
    <>
      <Typography.Title level={4}>{task.title || '无标题笔记'}</Typography.Title>
      <Descriptions
        size="small"
        column={2}
        style={{ marginBottom: 24 }}
        items={[
          {
            key: 'state',
            label: '状态',
            children: <Tag color={states[task.state]?.color}>{states[task.state]?.label}</Tag>,
          },
          { key: 'author', label: '作者', children: task.author_name || '—' },
          {
            key: 'items',
            label: '内容',
            children: `${task.successful_items} 成功 · ${task.skipped_items} 跳过 · ${task.failed_items} 失败`,
          },
          {
            key: 'fulfilled',
            label: '已验证覆盖',
            children: `${task.fulfilled_items} / ${task.planned_items} 项`,
          },
          { key: 'created', label: '创建时间', children: formatTime(task.created_at_ms) },
          { key: 'finished', label: '完成时间', children: formatTime(task.finished_at_ms) },
          {
            key: 'root',
            label: '输出位置',
            span: 2,
            children: (
              <Typography.Text copyable>
                {task.config.output.directory}\{task.relative_directory}
              </Typography.Text>
            ),
          },
        ]}
      />
      <Table
        size="small"
        rowKey="id"
        dataSource={items.data ?? []}
        pagination={false}
        scroll={{ x: 800 }}
        columns={[
          { title: '#', dataIndex: 'sequence', width: 40 },
          {
            title: '内容',
            render: (_v: unknown, item) => (
              <Space orientation="vertical" size={0}>
                <Typography.Text>{mediaLabels[item.kind]}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {[
                    item.representation.codec_group,
                    item.representation.scene,
                    item.representation.image_index && `图片 ${item.representation.image_index}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: '结果',
            render: (_v: unknown, item) => (
              <Space orientation="vertical" size={0}>
                <Tag
                  color={
                    item.state === ItemState.ItemSucceeded
                      ? 'green'
                      : item.state === ItemState.ItemFailed
                        ? 'red'
                        : undefined
                  }
                >
                  {itemLabels[item.state]}
                </Tag>
                {item.result.skip_reason === SkipReason.SkipHistory && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    历史文件已验证
                  </Typography.Text>
                )}
                {item.result.skip_reason === SkipReason.SkipFileExists && (
                  <Typography.Text type="warning" style={{ fontSize: 11 }}>
                    文件已存在，未验证资产
                  </Typography.Text>
                )}
                {item.failure && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {item.failure.message}
                  </Typography.Text>
                )}
              </Space>
            ),
          },
          {
            title: '大小',
            render: (_v: unknown, item) => formatBytes(item.result.bytes || item.expected_bytes),
          },
          { title: '尝试', dataIndex: 'attempts', width: 50 },
          {
            title: '文件',
            render: (_v: unknown, item) => (
              <Typography.Text
                style={{ fontSize: 12 }}
                ellipsis={{ tooltip: item.result.relative_path || item.relative_path }}
              >
                {(item.result.relative_path || item.relative_path).split(/[\\/]/).at(-1)}
              </Typography.Text>
            ),
          },
        ]}
      />
      {!items.data?.length && <Empty description="暂无下载明细" />}
    </>
  );
}
export function TaskDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Drawer title="笔记任务详情" open={id !== null} onClose={onClose} size={960} destroyOnHidden>
      {id && <Contents key={id} id={id} />}
    </Drawer>
  );
}
