import type { CSSProperties, ReactNode } from 'react'
import styles from './IconButton.module.css'

interface IconButtonProps {
  children: ReactNode
  size?: 'small' | 'medium' | 'large'
  variant?: 'default' | 'danger' | 'primary'
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  title?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

export function IconButton({
  children,
  size = 'medium',
  variant = 'default',
  onClick,
  disabled,
  title,
  className,
  style,
  ariaLabel,
}: IconButtonProps) {
  const sizeClass = size === 'small' ? styles.small : size === 'large' ? styles.large : ''
  const variantClass = variant === 'danger' ? styles.danger : variant === 'primary' ? styles.primary : ''

  return (
    <button
      type="button"
      className={`${styles.root} ${sizeClass} ${variantClass}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}
