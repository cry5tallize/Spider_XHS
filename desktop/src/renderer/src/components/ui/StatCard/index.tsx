import type { CSSProperties, ReactNode } from 'react'
import styles from './StatCard.module.css'

interface StatCardProps {
  value: number | string
  label: string
  note?: string
  icon?: ReactNode
  color?: string
  trend?: { direction: 'up' | 'down'; value: string }
  onClick?: () => void
  className?: string
  style?: CSSProperties
}

export function StatCard({
  value,
  label,
  note,
  icon,
  color,
  trend,
  onClick,
  className,
  style,
}: StatCardProps) {
  return (
    <div
      className={`${styles.root} ${onClick ? styles.clickable : ''}${className ? ` ${className}` : ''}`}
      style={style}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {color && <div className={styles.accentBar} style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />}
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={styles.icon} style={{ color }}>{icon}</span>}
      </div>
      <div className={styles.value} style={color ? { color } : undefined}>
        {value}
        {trend && (
          <span className={`${styles.trend} ${trend.direction === 'up' ? styles.trendUp : styles.trendDown}`}>
            {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      {note && <div className={styles.note}>{note}</div>}
    </div>
  )
}
