import { useEffect, useRef, useState } from 'react';
import { Button, Layout, Tooltip, Typography, theme } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MinusOutlined,
  BorderOutlined,
  CopyOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigation } from 'react-router';
import {
  minimizeWindow,
  maximizeWindow,
  closeWindow,
  isWindowMaximised,
  subscribeWindowState,
} from '@/shared/bridge';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('xhs.sidebar.collapsed') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('xhs.sidebar.collapsed', String(collapsed));
    } catch {
      /* Preference storage is optional. */
    }
  }, [collapsed]);
  const [maximised, setMaximised] = useState(false);
  const toggling = useRef(false);
  useEffect(() => {
    let mounted = true;
    const sync = () => {
      void isWindowMaximised()
        .then((value) => {
          if (mounted) setMaximised(value);
        })
        .catch(console.error);
    };
    sync();
    const off = subscribeWindowState(sync);
    return () => {
      mounted = false;
      off();
    };
  }, []);
  const toggleMaximise = async () => {
    if (toggling.current) return;
    toggling.current = true;
    try {
      await maximizeWindow();
      setMaximised(await isWindowMaximised());
    } catch (error) {
      console.error(error);
    } finally {
      toggling.current = false;
    }
  };
  const location = useLocation();
  const navigation = useNavigation();
  const { token } = theme.useToken();
  const selected =
    ['/settings', '/accounts', '/parse', '/notes', '/downloads', '/history'].find(
      (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
    ) || '/';
  return (
    <Layout className="desktop-shell">
      <Layout.Sider
        className="app-sidebar"
        width={232}
        collapsedWidth={76}
        collapsed={collapsed}
        style={{
          background: 'var(--sidebar-bg)',
          borderRight: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Sidebar collapsed={collapsed} />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          className="titlebar"
          onDoubleClick={(event) => {
            if (
              !(event.target instanceof Element) ||
              event.target.closest('.no-drag, button, a, input, [role="button"]')
            )
              return;
            event.preventDefault();
            void toggleMaximise();
          }}
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Button
            className="no-drag"
            type="text"
            aria-label={collapsed ? '展开导航' : '收起导航'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Typography.Text className="titlebar-label">
            {{
              '/settings': '设置',
              '/accounts': '账号管理',
              '/parse': '解析笔记',
              '/notes': '笔记库',
              '/downloads': '下载任务',
              '/history': '下载历史',
            }[selected] || '工作空间'}
          </Typography.Text>
          <div className="window-actions no-drag">
            <Tooltip title="最小化">
              <Button
                type="text"
                aria-label="最小化"
                icon={<MinusOutlined />}
                onClick={() => void minimizeWindow().catch(console.error)}
              />
            </Tooltip>
            <Tooltip title={maximised ? '还原' : '最大化'}>
              <Button
                type="text"
                aria-label={maximised ? '还原' : '最大化'}
                icon={maximised ? <CopyOutlined /> : <BorderOutlined />}
                onClick={() => void toggleMaximise()}
              />
            </Tooltip>
            <Tooltip title="关闭">
              <Button
                className="close-window"
                type="text"
                aria-label="关闭"
                icon={<CloseOutlined />}
                onClick={() => void closeWindow().catch(console.error)}
              />
            </Tooltip>
          </div>
        </Layout.Header>
        <Layout.Content className="page-content" aria-busy={navigation.state !== 'idle'}>
          {navigation.state !== 'idle' && <div className="route-loading" />}
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
