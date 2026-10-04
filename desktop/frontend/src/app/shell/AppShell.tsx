import { useState } from 'react';
import { Button, Layout, Menu, Tooltip, Typography, theme } from 'antd';
import { AppstoreOutlined, LinkOutlined, FileImageOutlined, DownloadOutlined, HistoryOutlined, UserOutlined,
  SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MinusOutlined, BorderOutlined, CloseOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, useNavigation } from 'react-router';
import { minimizeWindow, maximizeWindow, closeWindow } from '@/shared/bridge';
import { useBootstrap } from '../bootstrap-context';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const { token } = theme.useToken();
  const selected = ['/settings', '/accounts', '/parse', '/notes', '/downloads', '/history'].find(path => location.pathname === path || location.pathname.startsWith(`${path}/`)) || '/';
  return <Layout className="desktop-shell">
    <Layout.Sider width={216} collapsedWidth={72} collapsed={collapsed}
      style={{ background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}` }}>
      <div className="brand"><div className="brand-mark">X</div>{!collapsed && <div><strong>XHS Desktop</strong><small>你的笔记工作空间</small></div>}</div>
      <Menu mode="inline" selectedKeys={[selected]} onClick={({ key }) => void navigate(key)} items={[
        { key: '/', icon: <AppstoreOutlined />, label: '工作空间' },
        { key: '/parse', icon: <LinkOutlined />, label: '解析笔记' },
        { key: '/notes', icon: <FileImageOutlined />, label: '笔记库' },
        { key: '/downloads', icon: <DownloadOutlined />, label: '下载任务' },
        { key: '/history', icon: <HistoryOutlined />, label: '下载历史' },
        { key: '/accounts', icon: <UserOutlined />, label: '账号管理' },
        { type: 'divider' },
        { key: '/settings', icon: <SettingOutlined />, label: '设置' },
      ]} />
      <div className="sidebar-footer">{collapsed ? '0.1' : `本地存储 · v${bootstrap.version}`}</div>
    </Layout.Sider>
    <Layout>
      <Layout.Header className="titlebar" style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Button className="no-drag" type="text" aria-label={collapsed ? '展开导航' : '收起导航'}
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
        <Typography.Text className="titlebar-label">{{ '/settings': '设置', '/accounts': '账号管理', '/parse': '解析笔记', '/notes': '笔记库', '/downloads': '下载任务', '/history': '下载历史' }[selected] || '工作空间'}</Typography.Text>
        <div className="window-actions no-drag">
          <Tooltip title="最小化"><Button type="text" aria-label="最小化" icon={<MinusOutlined />} onClick={() => void minimizeWindow().catch(console.error)} /></Tooltip>
          <Tooltip title="最大化"><Button type="text" aria-label="最大化" icon={<BorderOutlined />} onClick={() => void maximizeWindow().catch(console.error)} /></Tooltip>
          <Tooltip title="关闭"><Button className="close-window" type="text" aria-label="关闭" icon={<CloseOutlined />} onClick={() => void closeWindow().catch(console.error)} /></Tooltip>
        </div>
      </Layout.Header>
      <Layout.Content className="page-content" aria-busy={navigation.state !== 'idle'}>
        {navigation.state !== 'idle' && <div className="route-loading" />}
        <Outlet />
      </Layout.Content>
    </Layout>
  </Layout>;
}
