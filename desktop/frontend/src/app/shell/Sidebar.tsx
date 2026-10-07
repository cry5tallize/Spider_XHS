import { useSyncExternalStore } from 'react';
import { Tooltip } from 'antd';
import {
  AppstoreOutlined,
  LinkOutlined,
  FileImageOutlined,
  DownloadOutlined,
  HistoryOutlined,
  UserOutlined,
  SettingOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { NavLink } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import icon from '@/assets/icon.webp';
import { AccountStatus, DownloadState } from '@/shared/contracts';
import { listAccounts } from '@/features/accounts/api';
import { progressStore } from '@/features/downloads/progress-store';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { useBootstrap } from '../bootstrap-context';

const downloadCount = () =>
  [...progressStore.snapshot().tasks.values()].filter((task) =>
    [
      DownloadState.Queued,
      DownloadState.Resolving,
      DownloadState.Running,
      DownloadState.WaitingRetry,
    ].includes(task.state),
  ).length;
const sections = [
  [
    { path: '/', label: '工作空间', icon: <AppstoreOutlined /> },
    { path: '/parse', label: '解析笔记', icon: <LinkOutlined /> },
    { path: '/notes', label: '笔记库', icon: <FileImageOutlined /> },
  ],
  [
    { path: '/downloads', label: '下载任务', icon: <DownloadOutlined /> },
    { path: '/history', label: '下载历史', icon: <HistoryOutlined /> },
  ],
];
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const bootstrap = useBootstrap();
  const activeDownloads = useSyncExternalStore(progressStore.subscribe, downloadCount, () => 0);
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: ({ signal }) => listAccounts(signal),
    staleTime: 30000,
    retry: false,
  });
  const account = accounts.data?.find((account) => account.is_default);
  const nickname = account?.nickname || account?.name;
  const ready = !!account?.enabled && account.has_cookie && account.status === AccountStatus.Valid;
  const accountPrefix = ready
    ? '默认：'
    : !account?.enabled
      ? '已停用：'
      : account.status === AccountStatus.Expired
        ? '已过期：'
        : '待处理：';
  const accountDescription = accounts.isError
    ? '账号暂时无法读取'
    : nickname
      ? accountPrefix + nickname
      : '添加或设置默认账号';
  return (
    <div className={'workspace-sidebar' + (collapsed ? ' is-collapsed' : '')}>
      <div className="sidebar-brand">
        <img src={icon} width={44} height={44} alt="XHS Desktop" draggable={false} />
        {!collapsed && (
          <div>
            <strong>XHS Desktop</strong>
            <span>笔记工作空间</span>
          </div>
        )}
      </div>
      <nav className="sidebar-navigation" aria-label="主导航">
        {sections.map((section, index) => (
          <div className="sidebar-nav-section" key={index}>
            {!collapsed && (
              <div className="sidebar-section-label">{index === 0 ? '工作区' : '下载与记录'}</div>
            )}
            {section.map((item) => (
              <Tooltip key={item.path} title={collapsed ? item.label : undefined} placement="right">
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  aria-label={item.label}
                  className={({ isActive }) => 'sidebar-nav-link' + (isActive ? ' is-active' : '')}
                >
                  <span className="sidebar-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
                  {item.path === '/downloads' && activeDownloads > 0 && (
                    <span
                      className={collapsed ? 'sidebar-task-dot' : 'sidebar-task-count'}
                      aria-label={activeDownloads + ' 个下载任务进行中'}
                    >
                      {collapsed ? '' : activeDownloads > 99 ? '99+' : activeDownloads}
                    </span>
                  )}
                </NavLink>
              </Tooltip>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Tooltip
          title={collapsed ? '账号管理 · ' + accountDescription : undefined}
          placement="right"
        >
          <NavLink
            to="/accounts"
            aria-label="账号管理"
            className={({ isActive }) => 'sidebar-account-link' + (isActive ? ' is-active' : '')}
          >
            <span className="sidebar-account-avatar">
              {account ? (
                <UserAvatar url={account.avatar_url} name={nickname || '账号'} size={32} />
              ) : (
                <span className="sidebar-empty-account" aria-hidden="true">
                  {accounts.isPending ? <UserOutlined /> : <PlusOutlined />}
                </span>
              )}
              {account && (
                <i
                  className={ready ? 'is-ready' : 'needs-check'}
                  aria-label={ready ? '默认账号可用' : '默认账号需要处理'}
                />
              )}
            </span>
            {!collapsed && (
              <div>
                <strong>账号管理</strong>
                <span title={accountDescription}>
                  {accounts.isPending ? '读取账号…' : accountDescription}
                </span>
              </div>
            )}
          </NavLink>
        </Tooltip>
        <div className="sidebar-settings-row">
          <Tooltip title={collapsed ? '设置' : undefined} placement="right">
            <NavLink
              to="/settings"
              aria-label="设置"
              className={({ isActive }) => 'sidebar-nav-link' + (isActive ? ' is-active' : '')}
            >
              <span className="sidebar-nav-icon" aria-hidden="true">
                <SettingOutlined />
              </span>
              {!collapsed && <span className="sidebar-nav-label">设置</span>}
            </NavLink>
          </Tooltip>
          {!collapsed && <span className="sidebar-version">v{bootstrap.version}</span>}
        </div>
      </div>
    </div>
  );
}
