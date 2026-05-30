import type { PageKey } from '../../types'
import { getActionLabel } from '../../types'
import styles from './ActivityTimeline.module.css'

interface ActivityItem {
  id: string
  name: string
  action: string
  status: string
  createdAt: string
}

interface ActivityTimelineProps {
  items: ActivityItem[]
  onSelect: (taskId: string) => void
}

function getStatusColor(status: string) {
  switch (status) {
    case 'success': return 'var(--success-500)'
    case 'failed': return 'var(--error-500)'
    case 'running': return 'var(--primary-500)'
    case 'cancelled': return 'var(--gray-400)'
    default: return 'var(--gray-400)'
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'success': return '已完成'
    case 'failed': return '已失败'
    case 'running': return '运行中'
    case 'cancelled': return '已取消'
    default: return '待执行'
  }
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function ActivityTimeline({ items, onSelect }: ActivityTimelineProps) {
  return (
    <div className={styles.root}>
      {items.length > 0 ? (
        items.map((item) => (
          <div
            key={item.id}
            className={styles.item}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(item.id) }}
            role="button"
            tabIndex={0}
          >
            <div className={styles.dot} style={{ background: getStatusColor(item.status) }} />
            <div className={styles.content}>
              <div className={styles.taskName}>{item.name}</div>
              <div className={styles.meta}>
                <span>{getActionLabel(item.action)}</span>
                <span className={styles.metaDivider}>|</span>
                <span>{getStatusLabel(item.status)}</span>
                <span className={styles.metaDivider}>|</span>
                <span>{formatTime(item.createdAt)}</span>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className={styles.empty}>暂无活动</div>
      )}
    </div>
  )
}
