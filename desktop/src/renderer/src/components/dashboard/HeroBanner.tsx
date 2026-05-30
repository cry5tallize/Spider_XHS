import type { ReactNode } from 'react'
import { Button } from '@douyinfe/semi-ui'
import { IconPlus } from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'
import { getGreeting } from '../../types'
import styles from './HeroBanner.module.css'

interface HeroBannerProps {
  taskCount: number
  runningCount: number
  successCount: number
  failedCount: number
  extra?: ReactNode
}

export function HeroBanner({ taskCount, runningCount, successCount, failedCount, extra }: HeroBannerProps) {
  const { setActivePage } = useAppStore()

  return (
    <div className={styles.root}>
      <div className={styles.info}>
        <div className={styles.greeting}>{getGreeting()}</div>
        <h1 className={styles.title}>
          {taskCount > 0
            ? `你有 ${taskCount} 个任务`
            : '从一个新任务开始'}
        </h1>
        <p className={styles.subtitle}>
          {taskCount > 0
            ? `运行中 ${runningCount} 个，已完成 ${successCount} 个，失败 ${failedCount} 个。`
            : '创建采集任务，或者进入笔记批量解析工作台。'}
        </p>
      </div>
      <div className={styles.actions}>
        {extra}
        <Button type="tertiary" onClick={() => setActivePage('noteWorkbench')}>
          批量解析
        </Button>
        <Button type="primary" icon={<IconPlus />} onClick={() => setActivePage('newTask')}>
          新建任务
        </Button>
      </div>
    </div>
  )
}
