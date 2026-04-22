import { Tag } from '@douyinfe/semi-ui'
import type { PageKey } from '../../types'

const pageInfo: Record<PageKey, { title: string; subtitle: string }> = {
  dashboard: { title: '首页', subtitle: '快速开始你的采集工作流' },
  newTask: { title: '新建任务', subtitle: '在这里创建可复用的任务' },
  noteWorkbench: { title: '笔记批量解析', subtitle: '粘贴链接，预览后再下载' },
  tasks: { title: '任务管理', subtitle: '查看和管理所有采集任务' },
  settings: { title: '设置', subtitle: '管理账号和系统偏好' },
}

interface HeaderProps {
  activePage: PageKey
  accountCount: number
  taskCount: number
}

export function Header({ activePage, accountCount, taskCount }: HeaderProps) {
  const { title, subtitle } = pageInfo[activePage]

  return (
    <div
      style={{
        height: 60,
        padding: '0 24px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>
        <span
          style={{
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Tag color="blue" size="small" style={{ borderRadius: 9999, padding: '4px 12px' }}>
          {accountCount} 个账号
        </Tag>
        <Tag color="green" size="small" style={{ borderRadius: 9999, padding: '4px 12px' }}>
          {taskCount} 个任务
        </Tag>
      </div>
    </div>
  )
}
