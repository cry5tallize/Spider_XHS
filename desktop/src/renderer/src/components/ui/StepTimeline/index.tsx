import type { CSSProperties, ReactNode } from 'react'
import { IconTickCircle, IconAlertCircle, IconClock } from '@douyinfe/semi-icons'
import { Tag } from '@douyinfe/semi-ui'
import type { StatusType } from '../StatusBadge'
import styles from './StepTimeline.module.css'

export interface TimelineStep {
  id: string
  title: string
  status: StatusType
  startedAt: string
  endedAt: string
  duration: string
  inputEntries: Array<[string, unknown]>
  error?: string
  output?: unknown
  renderOutput?: () => ReactNode
}

interface StepTimelineProps {
  steps: TimelineStep[]
  className?: string
  style?: CSSProperties
}

function getNodeClass(status: StatusType): string {
  switch (status) {
    case 'success': return styles.nodeSuccess
    case 'failed': return styles.nodeFailed
    case 'running': return styles.nodeRunning
    case 'cancelled': return styles.nodeCancelled
    default: return styles.nodePending
  }
}

function getContentClass(status: StatusType): string {
  switch (status) {
    case 'running': return styles.contentRunning
    case 'success': return styles.contentSuccess
    case 'failed': return styles.contentFailed
    default: return styles.contentDefault
  }
}

function getStatusColor(status: StatusType) {
  switch (status) {
    case 'success': return 'green' as const
    case 'failed': return 'red' as const
    case 'running': return 'blue' as const
    default: return 'grey' as const
  }
}

function getStatusLabel(status: StatusType): string {
  switch (status) {
    case 'success': return '已完成'
    case 'failed': return '失败'
    case 'running': return '运行中'
    case 'cancelled': return '已取消'
    default: return '待执行'
  }
}

function formatDateTime(value: string) {
  if (!value) return '未开始'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatStepValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '空'
  if (typeof value === 'string') return value.length > 28 ? `${value.slice(0, 28)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `数组(${value.length})`
  if (typeof value === 'object') return `对象(${Object.keys(value).length})`
  return String(value)
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function StepTimeline({ steps, className, style }: StepTimelineProps) {
  if (steps.length === 0) return null

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`} style={style}>
      <div className={styles.track} />
      {steps.map((step, index) => {
        const nodeClass = getNodeClass(step.status)
        const contentClass = getContentClass(step.status)
        const previewInputs = step.inputEntries.slice(0, 3)

        return (
          <div key={step.id} className={styles.step}>
            <div className={`${styles.node} ${nodeClass}`}>
              {step.status === 'success' && <IconTickCircle size="small" />}
              {step.status === 'failed' && <IconAlertCircle size="small" />}
              {step.status === 'running' && <IconClock size="small" />}
              {step.status === 'pending' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gray-400)' }} />}
              {step.status === 'cancelled' && <div style={{ width: 8, height: 2, borderRadius: 9999, background: 'var(--gray-400)' }} />}
            </div>

            <div className={`${styles.content} ${contentClass}`}>
              <div className={styles.stepHeader}>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.stepTitle}>
                    步骤 {index + 1} · {step.title}
                  </div>
                  <div className={styles.stepMeta}>
                    {formatDateTime(step.startedAt)}
                    {step.endedAt ? ` - ${formatDateTime(step.endedAt)}` : ' - 进行中'}
                    <span style={{ marginLeft: 8 }}>耗时 {step.duration}</span>
                  </div>
                </div>
                <Tag size="small" color={getStatusColor(step.status)}>
                  {getStatusLabel(step.status)}
                </Tag>
              </div>

              {step.inputEntries.length > 0 && (
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <div className={styles.statItemLabel}>开始</div>
                    <div className={styles.statItemValue}>{formatDateTime(step.startedAt)}</div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statItemLabel}>结束</div>
                    <div className={styles.statItemValue}>{formatDateTime(step.endedAt)}</div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statItemLabel}>耗时</div>
                    <div className={styles.statItemValue}>{step.duration}</div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statItemLabel}>输入项</div>
                    <div className={styles.statItemValue}>{step.inputEntries.length} 项</div>
                  </div>
                </div>
              )}

              {previewInputs.length > 0 && (
                <div className={styles.inputTags}>
                  {previewInputs.map(([key, value]) => (
                    <span key={key} className={styles.inputTag}>
                      {key}: {formatStepValue(value)}
                    </span>
                  ))}
                  {step.inputEntries.length > previewInputs.length && (
                    <span className={styles.inputTag} style={{ background: 'var(--gray-100)', color: 'var(--gray-600)' }}>
                      +{step.inputEntries.length - previewInputs.length}
                    </span>
                  )}
                </div>
              )}

              {step.error && <div className={styles.errorBox}>{step.error}</div>}

              {step.output != null && (
                <div className={styles.outputBox}>
                  <div className={styles.outputLabel}>输出预览</div>
                  <pre className={styles.outputPre}>{safeJson(step.output)}</pre>
                </div>
              )}

              {step.renderOutput != null ? (step.renderOutput() as ReactNode) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
