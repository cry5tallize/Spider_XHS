import type { CSSProperties, ReactNode } from 'react'
import styles from './Card.module.css'

interface CardProps {
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
  variant?: 'default' | 'bordered' | 'flat'
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export function Card({
  children,
  header,
  footer,
  variant = 'default',
  className,
  style,
  onClick,
}: CardProps) {
  const variantClass = variant === 'flat' ? styles.flat : variant === 'bordered' ? styles.bordered : ''

  return (
    <div
      className={`${styles.root} ${variantClass}${className ? ` ${className}` : ''}`}
      style={{ ...style, cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {header && (
        <div className={styles.header}>
          {typeof header === 'string' ? (
            <div>
              <div className={styles.title}>{header}</div>
            </div>
          ) : header}
        </div>
      )}
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}
