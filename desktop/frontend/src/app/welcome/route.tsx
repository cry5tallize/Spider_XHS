import { Button, Card, Space, Typography, theme } from 'antd';
import {
  ArrowRightOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { useBootstrap } from '../bootstrap-context';
import { themeModeLabels } from '@/shared/contracts/labels';

export function Component() {
  const navigate = useNavigate();
  const { settings, default_download_directory } = useBootstrap();
  const { token } = theme.useToken();
  return (
    <div className="page welcome-page">
      <div className="eyebrow">你的个人工作空间</div>
      <Typography.Title level={1}>让每一篇笔记，都井然有序。</Typography.Title>
      <Typography.Paragraph type="secondary" className="page-description">
        粘贴笔记链接，完整整理视频、图片与 LivePhoto，保留每一次解析的媒体快照。
      </Typography.Paragraph>
      <Button
        type="primary"
        size="large"
        icon={<ArrowRightOutlined />}
        iconPlacement="end"
        onClick={() => void navigate('/parse')}
      >
        解析笔记
      </Button>
      <div className="preference-grid">
        {[
          {
            icon: <FolderOpenOutlined />,
            title: '下载位置',
            value: settings.output_directory || default_download_directory,
            caption: '为笔记选择一个专属文件夹',
          },
          {
            icon: <ThunderboltOutlined />,
            title: '笔记并发',
            value: `${settings.max_concurrent_notes} 条笔记`,
            caption: '每条笔记内部按顺序下载',
          },
          {
            icon: <BulbOutlined />,
            title: '外观',
            value: themeModeLabels[settings.theme_mode],
            caption: '为不同光线选择舒适的界面',
          },
        ].map((item) => (
          <Card key={item.title} className="preference-card">
            <Space className="preference-heading">
              <span style={{ color: token.colorPrimary }}>{item.icon}</span>
              <Typography.Text type="secondary">{item.title}</Typography.Text>
            </Space>
            <Typography.Title level={4} ellipsis={{ tooltip: item.value }}>
              {item.value}
            </Typography.Title>
            <Typography.Text type="secondary">{item.caption}</Typography.Text>
          </Card>
        ))}
      </div>
      <div className="workspace-note" style={{ borderColor: token.colorBorderSecondary }}>
        <span className="workspace-dot" style={{ background: token.colorSuccess }} />
        <Typography.Text type="secondary">
          偏好与数据保存在本机，重新打开应用后继续使用。
        </Typography.Text>
      </div>
    </div>
  );
}
