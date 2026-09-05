import type { ReactNode } from 'react'
import type { PageKey } from '../../types'
import type { AppNotification } from '../../stores/appStore'
import { NotificationPanel } from './NotificationPanel'
import styles from './Header.module.css'

const pageInfo: Record<PageKey, { title: string; subtitle: string }> = {
  dashboard: { title: '首页', subtitle: '快速开始你的采集工作流' },
  newTask: { title: '新建任务', subtitle: '创建可复用的采集任务' },
  noteWorkbench: { title: '笔记批量解析', subtitle: '粘贴链接，预览后再下载' },
  tasks: { title: '任务管理', subtitle: '查看和管理所有采集任务' },
  settings: { title: '设置', subtitle: '管理账号和系统偏好' },
}

interface HeaderProps {
  activePage: PageKey
  accountCount: number
  taskCount: number
  notifications: AppNotification[]
  onClearNotifications: () => void
  onNavigateToTask: (page: PageKey, taskId: string) => void
  extra?: ReactNode
}

export function Header({
  activePage,
  accountCount,
  taskCount,
  notifications,
  onClearNotifications,
  onNavigateToTask,
  extra,
}: HeaderProps) {
  const { title, subtitle } = pageInfo[activePage]

  return (
    <div className={styles.root}>
      <div className={styles.info}>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.subtitle}>{subtitle}</span>
      </div>

      <div className={styles.actions}>
        <div className={styles.tags}>
          <span className={`${styles.tag} ${styles.tagAccounts}`}>
            {accountCount} 个账号
          </span>
          <span className={`${styles.tag} ${styles.tagTasks}`}>
            {taskCount} 个任务
          </span>
          <span className={styles.shortcutHint}>Ctrl+N 新建</span>
        </div>

        <NotificationPanel
          notifications={notifications}
          onClear={onClearNotifications}
          onNavigate={onNavigateToTask}
        />

        {extra}
      </div>
    </div>
  )
}
