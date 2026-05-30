import type { CSSProperties, ReactNode } from 'react'
import styles from './StatusBadge.module.css'

export type StatusType = 'success' | 'failed' | 'running' | 'pending' | 'cancelled'

const STATUS_CONFIG: Record<StatusType, { className: string; defaultLabel: string }> = {
  success: { className: styles.success, defaultLabel: '已完成' },
  failed: { className: styles.error, defaultLabel: '已失败' },
  running: { className: styles.processing, defaultLabel: '运行中' },
  pending: { className: styles.pending, defaultLabel: '待执行' },
  cancelled: { className: styles.cancelled, defaultLabel: '已取消' },
}

interface StatusBadgeProps {
  status: StatusType
  label?: string
  icon?: ReactNode
  className?: string
  style?: CSSProperties
}

export function StatusBadge({ status, label, icon, className, style }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`${styles.root} ${cfg.className}${className ? ` ${className}` : ''}`} style={style}>
      {icon}
      {label ?? cfg.defaultLabel}
    </span>
  )
}

export function StatusDot({ status, style }: { status: StatusType; style?: CSSProperties }) {
  const cfg = STATUS_CONFIG[status]
  return <span className={`${styles.dot} ${cfg.className}`} style={style} />
}

export { STATUS_CONFIG }
