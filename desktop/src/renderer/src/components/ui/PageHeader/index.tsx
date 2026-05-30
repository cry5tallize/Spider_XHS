import type { CSSProperties, ReactNode } from 'react'
import styles from './PageHeader.module.css'

interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: string
  actions?: ReactNode
  className?: string
  style?: CSSProperties
}

export function PageHeader({ title, subtitle, badge, actions, className, style }: PageHeaderProps) {
  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`} style={style}>
      <div className={styles.topRow}>
        <div className={styles.heading}>
          {badge && <div className={styles.badge}>{badge}</div>}
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  )
}
