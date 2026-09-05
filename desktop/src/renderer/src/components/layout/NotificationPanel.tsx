import { Popover } from '@douyinfe/semi-ui'
import { IconBell, IconTickCircle, IconAlertCircle } from '@douyinfe/semi-icons'
import type { PageKey } from '../../types'
import styles from './NotificationPanel.module.css'

export interface AppNotification {
  id: string
  taskId: string
  taskName: string
  status: 'success' | 'failed'
  timestamp: string
}

interface NotificationPanelProps {
  notifications: AppNotification[]
  onClear: () => void
  onNavigate: (page: PageKey, taskId: string) => void
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return date.toLocaleDateString('zh-CN')
}

export function NotificationPanel({ notifications, onClear, onNavigate }: NotificationPanelProps) {
  const unreadCount = notifications.length

  const panel = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>通知</span>
        {notifications.length > 0 && (
          <button type="button" className={styles.clearBtn} onClick={onClear}>
            全部清除
          </button>
        )}
      </div>
      <div className={styles.list}>
        {notifications.length > 0 ? (
          notifications.map((n) => (
            <div
              key={n.id}
              className={styles.item}
              onClick={() => onNavigate('tasks', n.taskId)}
              onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('tasks', n.taskId) }}
              role="button"
              tabIndex={0}
            >
              <span className={styles.itemIcon}>
                {n.status === 'success' ? (
                  <IconTickCircle size="small" style={{ color: 'var(--success-500)' }} />
                ) : (
                  <IconAlertCircle size="small" style={{ color: 'var(--error-500)' }} />
                )}
              </span>
              <div className={styles.itemContent}>
                <div className={styles.itemTitle}>{n.taskName}</div>
                <div className={styles.itemTime}>
                  {n.status === 'success' ? '已完成' : '失败'} · {formatTime(n.timestamp)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyNotice}>暂无新通知</div>
        )}
      </div>
    </div>
  )

  return (
    <Popover content={panel} trigger="click" position="bottomRight" showArrow>
      <button type="button" className={styles.trigger} aria-label="通知">
        <IconBell />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>
    </Popover>
  )
}
