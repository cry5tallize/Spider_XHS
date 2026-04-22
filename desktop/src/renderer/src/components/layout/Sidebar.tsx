import type { ReactNode } from 'react'
import { Avatar, Typography } from '@douyinfe/semi-ui'
import {
  IconHome,
  IconPlus,
  IconSearch,
  IconList,
  IconSetting,
} from '@douyinfe/semi-icons'
import type { PageKey } from '../../types'

const { Text } = Typography

const NAV_ITEMS: Array<{
  key: PageKey
  label: string
  icon: ReactNode
}> = [
  { key: 'dashboard', label: '首页', icon: <IconHome /> },
  { key: 'newTask', label: '新建任务', icon: <IconPlus /> },
  { key: 'noteWorkbench', label: '笔记批量解析', icon: <IconSearch /> },
  { key: 'tasks', label: '任务管理', icon: <IconList /> },
  { key: 'settings', label: '设置', icon: <IconSetting /> },
]

interface SidebarProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  activeAccount: DesktopAccountSettings | null
}

function SidebarNavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="sidebar-nav-item"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid transparent',
        background: active ? 'var(--primary-50)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? 'var(--primary-700)' : 'var(--color-text-tertiary)',
          background: active ? 'var(--primary-100)' : 'var(--gray-100)',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <span
        style={{
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          color: 'var(--color-text-primary)',
        }}
      >
        {label}
      </span>
    </button>
  )
}

export function Sidebar({ activePage, onNavigate, activeAccount }: SidebarProps) {
  return (
    <aside className="app-sider" style={{ borderRight: 0 }}>
      <div className="brand">
        <div className="brand-logo" style={{ gap: 10 }}>
          <Avatar
            size="small"
            style={{
              background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
              fontWeight: 600,
            }}
          >
            S
          </Avatar>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Spider XHS
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>任务中心</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.key}
            active={activePage === item.key}
            icon={item.icon}
            label={item.label}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </div>

      <div className="sider-footer">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'var(--gray-50)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Avatar
            size="extra-small"
            style={{
              background: activeAccount ? 'var(--success-500)' : 'var(--gray-400)',
              fontSize: 10,
            }}
          >
            {activeAccount ? (activeAccount.name || 'A').slice(0, 1) : '?'}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>当前账号</div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {activeAccount?.name || '未登录账号'}
            </div>
          </div>
        </div>
        <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          {activeAccount?.remark || '先配置账号 Cookie，再开始采集。'}
        </Text>
      </div>
    </aside>
  )
}
