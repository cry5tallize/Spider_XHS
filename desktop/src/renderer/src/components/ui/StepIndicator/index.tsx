import { IconTick } from '@douyinfe/semi-icons'
import type { CSSProperties } from 'react'
import styles from './StepIndicator.module.css'

export interface Step {
  key: string
  label: string
}

interface StepIndicatorProps {
  steps: Step[]
  current: number
  className?: string
  style?: CSSProperties
}

function getStepState(index: number, current: number) {
  if (index < current) return 'completed' as const
  if (index === current) return 'current' as const
  return 'pending' as const
}

export function StepIndicator({ steps, current, className, style }: StepIndicatorProps) {
  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`} style={style}>
      {steps.map((step, index) => {
        const state = getStepState(index, current)
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`${styles.step} ${styles[state]}`}>
              <div className={styles.dot}>
                {state === 'completed' ? <IconTick size="small" /> : index + 1}
              </div>
              <span className={styles.label}>{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`${styles.connector} ${
                  state === 'completed' ? styles.connectorCompleted : styles.connectorPending
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
