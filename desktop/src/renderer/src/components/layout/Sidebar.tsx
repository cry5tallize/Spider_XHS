import type { ReactNode } from 'react'
import { Avatar, Tooltip } from '@douyinfe/semi-ui'
import {
  IconHome,
  IconPlus,
  IconSearch,
  IconList,
  IconSetting,
  IconSidebar,
} from '@douyinfe/semi-icons'
import type { PageKey } from '../../types'
import styles from './Sidebar.module.css'

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
  isCollapsed: boolean
  onToggleCollapse: () => void
  runningTaskCount: number
  failedTaskCount: number
}

export function Sidebar({
  activePage,
  onNavigate,
  activeAccount,
  isCollapsed,
  onToggleCollapse,
  runningTaskCount,
  failedTaskCount,
}: SidebarProps) {
  const getTaskBadge = (key: PageKey) => {
    if (key !== 'tasks') return 0
    return runningTaskCount + failedTaskCount
  }

  return (
    <aside className={`${styles.sider} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* Brand */}
      <div className={`${styles.brand} ${isCollapsed ? styles.brandCollapsed : ''}`}>
        <div className={styles.brandLogo}>
          <Avatar
            size="small"
            style={{
              background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
              fontWeight: 600,
            }}
          >
            S
          </Avatar>
          {!isCollapsed && (
            <div className={styles.brandInfo}>
              <div className={styles.brandName}>Spider XHS</div>
              <div className={styles.brandTagline}>数据采集中心</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`${styles.nav} ${isCollapsed ? styles.navCollapsed : ''}`}>
        {NAV_ITEMS.map((item) => {
          const active = activePage === item.key
          const badge = getTaskBadge(item.key)

          const content = (
            <button
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={active ? 'page' : undefined}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''} ${isCollapsed ? styles.navItemCollapsed : ''}`}
            >
              <div className={`${styles.navIcon} ${active ? styles.navIconActive : styles.navIconInactive}`}>
                {item.icon}
              </div>
              {!isCollapsed && (
                <>
                  <span className={`${styles.navLabel} ${active ? styles.navLabelActive : ''}`}>
                    {item.label}
                  </span>
                  {badge > 0 && (
                    <span className={styles.navBadge}>{badge}</span>
                  )}
                </>
              )}
              {isCollapsed && badge > 0 && (
                <span className={`${styles.navBadge} ${styles.navBadgeCollapsed}`}>{badge}</span>
              )}
            </button>
          )

          if (isCollapsed) {
            return (
              <Tooltip key={item.key} content={item.label} position="right">
                {content}
              </Tooltip>
            )
          }

          return <div key={item.key}>{content}</div>
        })}
      </nav>

      {/* Footer */}
      <div className={`${styles.footer} ${isCollapsed ? styles.footerCollapsed : ''}`}>
        <div className={`${styles.footerCard} ${isCollapsed ? styles.footerCardCollapsed : ''}`}>
          <Avatar
            size="extra-small"
            style={{
              background: activeAccount ? 'var(--success-500)' : 'var(--gray-400)',
            }}
          >
            {activeAccount ? (activeAccount.name || 'A').slice(0, 1) : '?'}
          </Avatar>
          {!isCollapsed && (
            <div className={styles.footerInfo}>
              <div className={styles.footerLabel}>当前账号</div>
              <div className={styles.footerName}>
                {activeAccount?.name || '未登录'}
              </div>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <div className={styles.footerHint}>
            {activeAccount?.remark || '先配置 Cookie 再采集'}
          </div>
        )}
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={onToggleCollapse}
          title={isCollapsed ? '展开侧栏' : '收起侧栏'}
        >
          <IconSidebar style={{ transform: isCollapsed ? 'scaleX(-1)' : undefined }} />
        </button>
      </div>
    </aside>
  )
}
