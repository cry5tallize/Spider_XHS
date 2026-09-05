import { Avatar, Button } from '@douyinfe/semi-ui'
import {
  IconArrowRight,
  IconPlayCircle,
  IconTickCircle,
  IconAlertCircle,
  IconSetting,
} from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'
import { HeroBanner, ActivityTimeline } from '../../components/dashboard'
import { StatCard, Card, StatusBadge } from '../../components/ui'
import type { StatusType } from '../../components/ui'
import styles from './Dashboard.module.css'

const QUICK_STARTS = [
  { mode: 'note' as const, title: '笔记详情', desc: '抓单条笔记，快速查看内容' },
  { mode: 'user' as const, title: '用户采集', desc: '按用户主页抓取全部作品' },
  { mode: 'search' as const, title: '关键词搜索', desc: '按关键词批量抓取笔记' },
  { mode: 'video' as const, title: '视频优先', desc: '优先保留视频类型结果' },
]

export default function DashboardPage() {
  const { tasks, settings, setActivePage, setTaskForm, setSelectedTaskId } = useAppStore()

  const runningCount = tasks.filter((t) => t.status === 'running').length
  const successCount = tasks.filter((t) => t.status === 'success').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const accountCount = settings?.accounts.length ?? 0
  const activeAccount = settings?.accounts.find((a) => a.id === settings.activeAccountId)

  const recentTasks = tasks.slice(0, 5)

  const handleQuickStart = (mode: typeof QUICK_STARTS[0]['mode']) => {
    setTaskForm((prev) => ({ ...prev, mode }))
    setActivePage('newTask')
  }

  const handleViewTask = (taskId: string) => {
    setSelectedTaskId(taskId)
    setActivePage('tasks')
  }

  return (
    <div className={styles.root}>
      <HeroBanner
        taskCount={tasks.length}
        runningCount={runningCount}
        successCount={successCount}
        failedCount={failedCount}
      />

      <div className={styles.stats}>
        <StatCard
          value={tasks.length}
          label="总任务"
          note={runningCount > 0 ? `${runningCount} 个运行中` : '当前无运行任务'}
          icon={<IconPlayCircle />}
          color="var(--primary-600)"
          onClick={() => setActivePage('tasks')}
        />
        <StatCard
          value={successCount}
          label="已完成"
          note={successCount > 0 ? '可继续导出或复用' : '还没有完成的任务'}
          icon={<IconTickCircle />}
          color="var(--success-600)"
          onClick={() => { setActivePage('tasks') }}
        />
        <StatCard
          value={failedCount}
          label="失败"
          note={failedCount > 0 ? '需要重跑或重解析' : '状态正常'}
          icon={<IconAlertCircle />}
          color="var(--error-600)"
          onClick={() => { setActivePage('tasks') }}
        />
        <StatCard
          value={accountCount}
          label="账号"
          note={activeAccount?.name || '未配置账号'}
          icon={<IconSetting />}
          color="var(--gray-600)"
          onClick={() => setActivePage('settings')}
        />
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.recentPanel}>
          <Card
            header={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>最近任务</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>查看状态、继续执行或打开详情</div>
                </div>
                <button type="button" className={styles.seeAllLink} onClick={() => setActivePage('tasks')}>
                  查看全部 <IconArrowRight size="small" />
                </button>
              </div>
            }
          >
            <ActivityTimeline items={recentTasks} onSelect={handleViewTask} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card header="快速开始">
            <div className={styles.quickCards}>
              {QUICK_STARTS.map((card) => (
                <button
                  key={card.mode}
                  type="button"
                  onClick={() => handleQuickStart(card.mode)}
                  className={styles.quickCard}
                >
                  <div className={styles.quickCardTitle}>{card.title}</div>
                  <div className={styles.quickCardDesc}>{card.desc}</div>
                </button>
              ))}
            </div>
          </Card>

          <div
            className={styles.accountWidget}
            style={{
              borderColor: activeAccount ? 'var(--success-200)' : 'var(--warning-200)',
              background: activeAccount ? 'var(--success-50)' : 'var(--warning-50)',
            }}
          >
            <div className={styles.accountHeader}>
              <Avatar
                size="small"
                style={{ background: activeAccount ? 'var(--success-500)' : 'var(--gray-400)' }}
              >
                {activeAccount ? (activeAccount.name || 'A').slice(0, 1) : '?'}
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <div className={styles.accountName}>
                  {activeAccount?.name || '未登录账号'}
                </div>
                <div className={styles.accountRemark}>
                  {activeAccount?.remark || '先配置 Cookie，再开始采集'}
                </div>
              </div>
            </div>
            <Button block type="tertiary" onClick={() => setActivePage('settings')}>
              去设置
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
