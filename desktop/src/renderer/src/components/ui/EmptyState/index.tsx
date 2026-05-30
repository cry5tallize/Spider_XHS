import type { CSSProperties, ReactNode } from 'react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  style?: CSSProperties
}

export function EmptyState({ icon, title, description, action, className, style }: EmptyStateProps) {
  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`} style={style}>
      {icon && <div className={styles.iconWrap}>{icon}</div>}
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
