import { Avatar, Button } from '@douyinfe/semi-ui'
import {
  IconPlus,
  IconPlayCircle,
  IconTickCircle,
  IconAlertCircle,
  IconSetting,
  IconArrowRight,
} from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'

const QUICK_STARTS = [
  { mode: 'note' as const, title: '笔记详情', desc: '抓单条笔记，快速查看内容' },
  { mode: 'user' as const, title: '用户采集', desc: '按用户主页抓取全部作品' },
  { mode: 'search' as const, title: '关键词搜索', desc: '按关键词批量抓取笔记' },
  { mode: 'video' as const, title: '视频优先', desc: '优先保留视频类型结果' },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 6) return '晚上好'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'success':
      return { text: '已完成', type: 'success' as const }
    case 'failed':
      return { text: '失败', type: 'error' as const }
    case 'running':
      return { text: '运行中', type: 'processing' as const }
    default:
      return { text: '待执行', type: 'default' as const }
  }
}

export default function DashboardPage() {
  const { tasks, settings, setActivePage, setTaskForm, setSelectedTaskId } = useAppStore()

  const recentTasks = tasks.slice(0, 5)
  const runningCount = tasks.filter((t) => t.status === 'running').length
  const successCount = tasks.filter((t) => t.status === 'success').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const accountCount = settings?.accounts.length ?? 0
  const activeAccount = settings?.accounts.find((a) => a.id === settings.activeAccountId)

  const stats = [
    { value: tasks.length, label: '总任务', note: runningCount > 0 ? `${runningCount} 个运行中` : '当前无运行任务', icon: <IconPlayCircle />, color: 'var(--primary-600)' },
    { value: successCount, label: '已完成', note: successCount > 0 ? '可继续导出或复用' : '还没有完成的任务', icon: <IconTickCircle />, color: 'var(--success-600)' },
    { value: failedCount, label: '失败', note: failedCount > 0 ? '需要重跑或重解析' : '状态正常', icon: <IconAlertCircle />, color: 'var(--error-600)' },
    { value: accountCount, label: '账号', note: activeAccount?.name || '未配置账号', icon: <IconSetting />, color: 'var(--gray-600)' },
  ]

  const handleQuickStart = (mode: typeof QUICK_STARTS[0]['mode']) => {
    setTaskForm((prev) => ({ ...prev, mode }))
    setActivePage('newTask')
  }

  const handleViewTask = (taskId: string) => {
    setSelectedTaskId(taskId)
    setActivePage('tasks')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
      <section
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>
              {getGreeting()}
            </div>
            <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.25, color: 'var(--color-text-primary)' }}>
              {tasks.length > 0 ? `你有 ${tasks.length} 个任务` : '从一个新任务开始'}
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--color-text-tertiary)', maxWidth: 640 }}>
              {tasks.length > 0
                ? `运行中 ${runningCount} 个，已完成 ${successCount} 个，失败 ${failedCount} 个。`
                : '先创建一个任务，或者直接进入笔记批量解析。'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button type="tertiary" onClick={() => setActivePage('noteWorkbench')}>
              批量解析
            </Button>
            <Button type="primary" icon={<IconPlus />} onClick={() => setActivePage('newTask')}>
              新建任务
            </Button>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {stats.map((item) => (
          <div
            key={item.label}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{item.label}</span>
              <span style={{ color: item.color, display: 'inline-flex' }}>{item.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: 'var(--color-text-primary)' }}>
              {item.value}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {item.note}
            </div>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 16 }}>
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>最近任务</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>查看状态、继续执行或打开详情</div>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('tasks')}
              style={{
                border: 0,
                background: 'transparent',
                color: 'var(--primary-600)',
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: 0,
              }}
            >
              查看全部 <IconArrowRight size="small" />
            </button>
          </div>

          {recentTasks.length > 0 ? (
            <div>
              {recentTasks.map((task, index) => {
                const status = getStatusBadge(task.status)
                const isLast = index === recentTasks.length - 1
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleViewTask(task.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background:
                          status.type === 'success'
                            ? 'var(--success-500)'
                            : status.type === 'processing'
                              ? 'var(--primary-500)'
                              : status.type === 'error'
                                ? 'var(--error-500)'
                                : 'var(--gray-400)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {task.name}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                        {task.action} · {task.createdAt}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 500,
                        flexShrink: 0,
                        background:
                          status.type === 'success'
                            ? 'var(--success-100)'
                            : status.type === 'processing'
                              ? 'var(--primary-100)'
                              : status.type === 'error'
                                ? 'var(--error-100)'
                                : 'var(--gray-100)',
                        color:
                          status.type === 'success'
                            ? 'var(--success-700)'
                            : status.type === 'processing'
                              ? 'var(--primary-700)'
                              : status.type === 'error'
                                ? 'var(--error-600)'
                                : 'var(--gray-600)',
                      }}
                    >
                      {status.text}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              还没有任务，先新建一个。
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>
              快速开始
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {QUICK_STARTS.map((card) => (
                <button
                  key={card.mode}
                  type="button"
                  onClick={() => handleQuickStart(card.mode)}
                  style={{
                    width: '100%',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {card.title}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {card.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>
              当前账号
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                size="small"
                style={{
                  background: activeAccount ? 'var(--success-500)' : 'var(--gray-400)',
                }}
              >
                {activeAccount ? (activeAccount.name || 'A').slice(0, 1) : '?'}
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {activeAccount?.name || '未登录账号'}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {activeAccount?.remark || '先配置 Cookie，再开始采集'}
                </div>
              </div>
            </div>
            <Button block type="tertiary" style={{ marginTop: 12 }} onClick={() => setActivePage('settings')}>
              去设置
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
