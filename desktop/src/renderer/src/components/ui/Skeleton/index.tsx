import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

type SkeletonVariant = 'text' | 'title' | 'card' | 'hero' | 'table' | 'grid' | 'circle' | 'avatar'

interface SkeletonProps {
  variant?: SkeletonVariant
  width?: string | number
  height?: string | number
  count?: number
  className?: string
  style?: CSSProperties
}

const variantClass: Record<SkeletonVariant, string> = {
  text: styles.text,
  title: `${styles.text} ${styles.title}`,
  card: styles.card,
  hero: styles.hero,
  table: styles.tableRow,
  grid: styles.grid,
  circle: styles.circle,
  avatar: styles.avatar,
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  className,
  style,
}: SkeletonProps) {
  return (
    <div
      className={`${styles.base} ${variantClass[variant]}${className ? ` ${className}` : ''}`}
      style={{ ...style, width, height }}
    />
  )
}

export function SkeletonGroup({
  variant = 'text',
  count = 3,
  className,
}: {
  variant?: SkeletonVariant
  count?: number
  className?: string
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant={variant} className={className} />
      ))}
    </>
  )
}

export function SkeletonPage() {
  return (
    <div>
      <Skeleton variant="hero" style={{ marginBottom: 'var(--space-6)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} variant="card" />
        ))}
      </div>
      <Skeleton variant="title" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} variant="text" width={`${85 - i * 12}%`} />
      ))}
    </div>
  )
}
