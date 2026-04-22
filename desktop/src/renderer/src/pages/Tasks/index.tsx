import { useEffect, useMemo, useState } from 'react'
import { Button, Toast, Modal, Dropdown, Progress, Tag, Select } from '@douyinfe/semi-ui'
import {
  IconPlus,
  IconPlayCircle,
  IconDownload,
  IconDelete,
  IconMore,
  IconRefresh,
  IconTickCircle,
  IconAlertCircle,
  IconClock
} from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'
import { getActionLabel, getStatusTag, isVideoTask, safeJson } from '../../types'

function formatDateTime(value: string) {
  if (!value) return '未开始'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function getStatusTone(status: string) {
  switch (status) {
    case 'success':
      return { bg: 'var(--success-100)', fg: 'var(--success-700)', border: 'var(--success-200)', text: '已完成' }
    case 'failed':
      return { bg: 'var(--error-100)', fg: 'var(--error-700)', border: 'var(--error-200)', text: '已失败' }
    case 'running':
      return { bg: 'var(--primary-100)', fg: 'var(--primary-700)', border: 'var(--primary-200)', text: '运行中' }
    case 'cancelled':
      return { bg: 'var(--gray-100)', fg: 'var(--gray-700)', border: 'var(--gray-200)', text: '已取消' }
    default:
      return { bg: 'var(--gray-100)', fg: 'var(--gray-700)', border: 'var(--gray-200)', text: '待执行' }
  }
}

function getStepDuration(startedAt: string, endedAt: string) {
  if (!startedAt || !endedAt) return '进行中'

  const duration = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  if (Number.isNaN(duration) || duration < 0) return '进行中'

  const seconds = Math.max(0, Math.round(duration / 1000))
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  return remain > 0 ? `${minutes}m ${remain}s` : `${minutes}m`
}

function formatStepValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '空'
  if (typeof value === 'string') return value.length > 28 ? `${value.slice(0, 28)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `数组(${value.length})`
  if (typeof value === 'object') return `对象(${Object.keys(value).length})`
  return String(value)
}

function getPrimaryTaskAction(task: DesktopTaskRun) {
  if (task.status === 'running') return { label: '取消任务', kind: 'cancel' as const }
  if (task.status === 'failed' || task.status === 'cancelled') return { label: '重试任务', kind: 'retry' as const }
  if (task.status === 'pending') return { label: '运行任务', kind: 'run' as const }
  return { label: '重新运行', kind: 'run' as const }
}

function getTaskNote(task: DesktopTaskRun) {
  const normalizedResult = task.normalizedResult as Record<string, unknown> | null
  const normalized = normalizedResult?.normalized
  return normalized && typeof normalized === 'object' ? (normalized as StandardNote) : null
}

function getTaskVideoStreamOptions(task: DesktopTaskRun) {
  const note = getTaskNote(task)
  const streams = note?.videoStreams ?? []
  const options = streams.map((stream) => {
    const resolution = stream.width && stream.height ? `${stream.width}x${stream.height}` : '未知分辨率'
    const bitrate = stream.avgBitrate ? `${Math.round(stream.avgBitrate / 1000)}kbps` : '未知码率'
    const codec = stream.videoCodec || stream.codec || 'unknown'
    return {
      label: `${codec} · ${resolution} · ${bitrate}${stream.defaultStream ? ' · 默认' : ''}`,
      value: stream.masterUrl,
    }
  })

  if (options.length > 0) {
    return options
  }

  return note?.videoAddr ? [{ label: '默认流', value: note.videoAddr }] : []
}

export default function TasksPage() {
  const {
    tasks,
    taskFilter,
    setTaskFilter,
    saving,
    setSaving,
    setActivePage,
    selectedTaskId,
    setSelectedTaskId,
    refreshAll,
    activeAccount
  } = useAppStore()

  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; taskId?: string; taskName?: string }>({ visible: false })
  const [videoStreamByTaskId, setVideoStreamByTaskId] = useState<Record<string, string>>({})
  const [exportProgress, setExportProgress] = useState<DesktopDownloadProgress | null>(null)

  const currentCookies = activeAccount?.cookiesStr ?? ''

  const filteredTasks = tasks.filter((task) => {
    if (taskFilter === 'all') return true
    const video = isVideoTask(task)
    return taskFilter === 'video' ? video : !video
  })

  const handleRunTask = async (taskId: string) => {
    setSaving(true)
    try {
      const run = await window.desktopAPI.tasks.run({
        taskId,
        cookiesStr: currentCookies
      })
      await refreshAll()
      setSelectedTaskId(run?.id ?? taskId)
      Toast.success('任务已运行')
    } catch (error) {
      Toast.error(`运行失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleExportTask = async (taskId: string, videoStreamUrl?: string) => {
    setSaving(true)
    try {
      const result = await window.desktopAPI.tasks.export({ taskId, videoStreamUrl })
      Toast.success(result?.exportPath ? `已导出到 ${result.exportPath}` : '已导出')
    } catch (error) {
      Toast.error(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    setSaving(true)
    try {
      await window.desktopAPI.tasks.remove({ taskId })
      await refreshAll()
      if (selectedTaskId === taskId) setSelectedTaskId(null)
      Toast.success('任务已删除')
    } catch (error) {
      Toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
      setDeleteModal({ visible: false })
    }
  }

  const handleRetryTask = async (taskId: string) => {
    setSaving(true)
    try {
      const run = await window.desktopAPI.tasks.retry({
        taskId,
        cookiesStr: currentCookies,
      })
      await refreshAll()
      setSelectedTaskId(run?.id ?? taskId)
      Toast.success('任务已重试')
    } catch (error) {
      Toast.error(`重试失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleRerunTask = async (taskId: string) => {
    setSaving(true)
    try {
      const run = await window.desktopAPI.tasks.rerun({
        taskId,
        cookiesStr: currentCookies,
      })
      await refreshAll()
      setSelectedTaskId(run?.id ?? taskId)
      Toast.success('已复制并重新运行')
    } catch (error) {
      Toast.error(`重新运行失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleReparseTask = async (taskId: string) => {
    setSaving(true)
    try {
      await window.desktopAPI.tasks.reparse({ taskId })
      await refreshAll()
      Toast.success('已重新解析')
    } catch (error) {
      Toast.error(`重新解析失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelTask = async (taskId: string) => {
    setSaving(true)
    try {
      await window.desktopAPI.tasks.cancel({ taskId })
      await refreshAll()
      Toast.success('任务已取消')
    } catch (error) {
      Toast.error(`取消失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()

  const groupedTasks = filteredTasks.reduce((groups, task) => {
    const taskDate = new Date(task.createdAt).toDateString()
    let group = '更早'
    if (taskDate === today) group = '今天'
    else if (taskDate === yesterday) group = '昨天'

    if (!groups[group]) groups[group] = []
    groups[group].push(task)
    return groups
  }, {} as Record<string, typeof filteredTasks>)

  const groupOrder = ['今天', '昨天', '更早']

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  )

  const selectedTaskNote = useMemo(() => (selectedTask ? getTaskNote(selectedTask) : null), [selectedTask])
  const selectedTaskVideoStreamOptions = useMemo(() => (selectedTask ? getTaskVideoStreamOptions(selectedTask) : []), [selectedTask])
  const selectedTaskVideoStreamUrl = selectedTask
    ? (videoStreamByTaskId[selectedTask.id] ?? selectedTaskVideoStreamOptions[0]?.value ?? '')
    : ''

  useEffect(() => {
    if (!selectedTask || selectedTaskNote?.noteType !== '视频' || selectedTaskVideoStreamOptions.length === 0) {
      return
    }

    const current = videoStreamByTaskId[selectedTask.id]
    const valid = current && selectedTaskVideoStreamOptions.some((item) => item.value === current)
    if (!valid) {
      setVideoStreamByTaskId((state) => ({ ...state, [selectedTask.id]: selectedTaskVideoStreamOptions[0].value }))
    }
  }, [selectedTask, selectedTaskNote, selectedTaskVideoStreamOptions, videoStreamByTaskId])

  useEffect(() => {
    return window.desktopAPI.tasks.onExportProgress((progress) => {
      setExportProgress(progress)
    })
  }, [])

  const stepOverview = useMemo(() => {
    const steps = selectedTask?.steps ?? []
    const total = steps.length
    const completed = steps.filter((step) => step.status === 'success').length
    const running = steps.filter((step) => step.status === 'running').length
    const failed = steps.filter((step) => step.status === 'failed').length
    const cancelled = steps.filter((step) => step.status === 'cancelled').length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, completed, running, failed, cancelled, progress }
  }, [selectedTask])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <IconTickCircle size="small" style={{ color: 'var(--success-500)' }} />
      case 'failed': return <IconAlertCircle size="small" style={{ color: 'var(--error-500)' }} />
      case 'running': return <IconClock size="small" style={{ color: 'var(--primary-500)' }} />
      default: return <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gray-400)' }} />
    }
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
      }}>
        <div style={{
          display: 'flex',
          gap: 4,
          background: 'var(--gray-100)',
          padding: 4,
          borderRadius: 8
        }}>
          {(['all', 'video', 'normal'] as const).map((item) => (
            <div
              key={item}
              onClick={() => setTaskFilter(item)}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                background: taskFilter === item ? 'var(--color-surface)' : 'transparent',
                color: taskFilter === item ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                boxShadow: taskFilter === item ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              {item === 'all' ? '全部' : item === 'video' ? '视频' : '普通'}
            </div>
          ))}
        </div>
        <Button
          type="primary"
          icon={<IconPlus />}
          onClick={() => setActivePage('newTask')}
        >
          新建任务
        </Button>
      </div>

      {/* Task List */}
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 12,
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {filteredTasks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {groupOrder.map((group) => {
              const groupTasks = groupedTasks[group]
              if (!groupTasks || groupTasks.length === 0) return null

              return (
                <div key={group}>
                  {/* Group Header */}
                  <div style={{
                    padding: '10px 20px',
                    background: 'var(--gray-50)',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}>
                    {group} ({groupTasks.length})
                  </div>

                  {groupTasks.map((task) => {
                    const status = getStatusTag(task.status)
                    const isSelected = selectedTaskId === task.id

                    return (
                      <div
                        key={task.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '14px 20px',
                          borderBottom: '1px solid var(--color-border)',
                          background: isSelected ? 'var(--primary-50)' : 'transparent',
                          borderLeft: isSelected ? '3px solid var(--primary-500)' : '3px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onClick={() => setSelectedTaskId(task.id)}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--gray-50)'
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        {/* Status */}
                        <div style={{ flexShrink: 0, width: 20, display: 'flex', justifyContent: 'center' }}>
                          {getStatusIcon(task.status)}
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 500,
                            fontSize: 14,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginBottom: 3
                          }}>
                            {task.name}
                          </div>
                          <div style={{
                            fontSize: 12,
                            color: 'var(--color-text-tertiary)',
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center'
                          }}>
                            <span>{task.action}</span>
                            <span style={{ color: 'var(--color-border)' }}>|</span>
                            <span>{task.createdAt}</span>
                            {task.status === 'running' && (
                              <>
                                <span style={{ color: 'var(--color-border)' }}>|</span>
                                <span style={{ color: 'var(--primary-500)' }}>进度 {task.progress}%</span>
                              </>
                            )}
                          </div>

                          {/* Progress Bar for running tasks */}
                          {task.status === 'running' && (
                            <div style={{
                              marginTop: 8,
                              width: '100%',
                              height: 4,
                              background: 'var(--gray-200)',
                              borderRadius: 9999,
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                height: '100%',
                                width: `${task.progress}%`,
                                background: 'linear-gradient(90deg, var(--primary-500), var(--primary-400))',
                                borderRadius: 9999,
                                transition: 'width 0.5s ease'
                              }} />
                            </div>
                          )}
                        </div>

                        {/* Status Tag */}
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: 500,
                          flexShrink: 0,
                          background: status.type === 'success' ? 'var(--success-100)' :
                            status.type === 'processing' ? 'var(--primary-100)' :
                              status.type === 'error' ? 'var(--error-100)' : 'var(--gray-100)',
                          color: status.type === 'success' ? 'var(--success-700)' :
                            status.type === 'processing' ? 'var(--primary-700)' :
                              status.type === 'error' ? 'var(--error-600)' : 'var(--gray-600)'
                        }}>
                          {status.text}
                        </span>

                        {/* Actions Dropdown */}
                        <Dropdown
                          trigger="click"
                          position="bottomRight"
                          menu={[
                            {
                              node: 'item',
                              icon: <IconPlayCircle />,
                              name: '运行任务',
                              onClick: () => handleRunTask(task.id),
                              disabled: saving,
                            },
                            {
                              node: 'item',
                              icon: <IconDownload />,
                              name: '导出数据',
                              onClick: () => handleExportTask(task.id, videoStreamByTaskId[task.id] ?? getTaskVideoStreamOptions(task)[0]?.value),
                              disabled: saving,
                            },
                            { node: 'divider' },
                            {
                              node: 'item',
                              icon: <IconDelete />,
                              type: 'danger',
                              name: '删除任务',
                              onClick: () => setDeleteModal({ visible: true, taskId: task.id, taskName: task.name }),
                              disabled: saving,
                            },
                          ]}
                        >
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-surface)',
                              color: 'var(--color-text-secondary)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: 'var(--shadow-sm)',
                              transition: 'background-color var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal)',
                            }}
                            aria-label="任务操作"
                          >
                            <IconMore />
                          </button>
                        </Dropdown>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--gray-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <IconRefresh style={{ fontSize: 28, color: 'var(--gray-400)' }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>暂无任务</div>
            <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginBottom: 24 }}>
              还没有符合条件的任务，点击右上角新建按钮创建你的第一个任务
            </div>
            <Button
              type="primary"
              icon={<IconPlus />}
              onClick={() => setActivePage('newTask')}
            >
              新建任务
            </Button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>任务详情</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              选中任务后可查看参数、步骤和结果
            </div>
          </div>
          {selectedTask && (
            <span style={{
              padding: '3px 10px',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: getStatusTone(selectedTask.status).bg,
              color: getStatusTone(selectedTask.status).fg,
              border: `1px solid ${getStatusTone(selectedTask.status).border}`
            }}>
              {getStatusTone(selectedTask.status).text}
            </span>
          )}
        </div>

        {selectedTask ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {selectedTask.name}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  {getActionLabel(selectedTask.action)} · {selectedTask.templateId ? '来自模板' : '手动创建'}
                </div>
              </div>
              <span style={{
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 600,
                background: getStatusTone(selectedTask.status).bg,
                color: getStatusTone(selectedTask.status).fg,
                border: `1px solid ${getStatusTone(selectedTask.status).border}`,
                flexShrink: 0
              }}>
                {getStatusTone(selectedTask.status).text}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
              {[
                { label: '创建时间', value: formatDateTime(selectedTask.createdAt) },
                { label: '更新时间', value: formatDateTime(selectedTask.updatedAt) },
                { label: '进度', value: `${selectedTask.progress}%` },
                { label: '重试次数', value: `${selectedTask.retryCount} 次` },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--gray-50)',
                  border: '1px solid var(--color-border)'
                }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{item.label}</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {selectedTask.status === 'running' && (
              <div style={{ width: '100%', height: 6, background: 'var(--gray-200)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{
                  width: `${selectedTask.progress}%`,
                  height: '100%',
                  borderRadius: 9999,
                  background: 'linear-gradient(90deg, var(--primary-500), var(--primary-400))'
                }} />
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button
                type="primary"
                loading={saving}
                onClick={() => {
                  if (selectedTask.status === 'running') {
                    void handleCancelTask(selectedTask.id)
                    return
                  }
                  if (selectedTask.status === 'failed' || selectedTask.status === 'cancelled') {
                    void handleRetryTask(selectedTask.id)
                    return
                  }
                  void handleRunTask(selectedTask.id)
                }}
              >
                {selectedTask.status === 'running' ? '取消任务' : selectedTask.status === 'failed' || selectedTask.status === 'cancelled' ? '重试任务' : '重新运行'}
              </Button>
              <Button type="tertiary" loading={saving} onClick={() => handleRerunTask(selectedTask.id)}>
                复制再跑
              </Button>
              <Button type="tertiary" loading={saving} disabled={!selectedTask.rawResult} onClick={() => handleReparseTask(selectedTask.id)}>
                重新解析
              </Button>
              <Button type="tertiary" loading={saving} onClick={() => handleExportTask(selectedTask.id, selectedTaskVideoStreamUrl)}>
                导出结果
              </Button>
              <Button
                type="tertiary"
                loading={saving}
                onClick={() => setDeleteModal({ visible: true, taskId: selectedTask.id, taskName: selectedTask.name })}
                style={{ color: 'var(--error-600)', borderColor: 'var(--error-200)' }}
              >
                删除任务
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>参数</div>
                <pre style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--gray-50)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 220,
                  overflow: 'auto'
                }}>
                  {safeJson(selectedTask.params)}
                </pre>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>标准化结果</div>
                <pre style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--gray-50)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 220,
                  overflow: 'auto'
                }}>
                  {safeJson(selectedTask.normalizedResult ?? selectedTask.result ?? {})}
                </pre>
              </div>
            </div>

            {selectedTaskNote?.noteType === '视频' && selectedTaskVideoStreamOptions.length > 0 && (
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--gray-50)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>导出视频流</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                  选择后，导出结果中的视频文件会使用该流。
                </div>
                <Select
                  value={selectedTaskVideoStreamUrl || selectedTaskVideoStreamOptions[0]?.value}
                  optionList={selectedTaskVideoStreamOptions}
                  onChange={(value) => setVideoStreamByTaskId((state) => ({ ...state, [selectedTask.id]: String(value ?? '') }))}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {exportProgress && (
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--gray-50)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>导出进度</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{exportProgress.message}</div>
                <Progress percent={exportProgress.percent} showInfo />
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  当前文件: {exportProgress.currentFile || '-'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {exportProgress.currentPercent !== null
                    ? `单文件进度: ${exportProgress.currentPercent}%`
                    : '单文件进度: 未知'}
                </div>
              </div>
            )}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>执行步骤</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {selectedTask.steps.length > 0
                      ? `共 ${stepOverview.total} 步，已完成 ${stepOverview.completed} 步`
                      : '暂无步骤信息'}
                  </div>
                </div>
                {selectedTask.steps.length > 0 && (
                  <div style={{ minWidth: 220, flex: 1, maxWidth: 360 }}>
                    <Progress percent={stepOverview.progress} showInfo />
                  </div>
                )}
              </div>

              {selectedTask.steps.length > 0 ? (
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 4 }}>
                  <div style={{
                    position: 'absolute',
                    left: 13,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    borderRadius: 9999,
                    background: 'linear-gradient(180deg, var(--primary-200), var(--color-border))'
                  }} />

                  {selectedTask.steps.map((step, index) => {
                    const tone = getStatusTone(step.status)
                    const inputEntries = Object.entries(step.input ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
                    const previewInputs = inputEntries.slice(0, 3)

                    return (
                      <div key={step.id} style={{ position: 'relative', paddingLeft: 28 }}>
                        <div style={{
                          position: 'absolute',
                          left: 4,
                          top: 14,
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: tone.bg,
                          border: `1px solid ${tone.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 0 3px var(--color-surface)',
                          zIndex: 1
                        }}>
                          {step.status === 'success' && <IconTickCircle size="small" style={{ color: tone.fg }} />}
                          {step.status === 'failed' && <IconAlertCircle size="small" style={{ color: tone.fg }} />}
                          {step.status === 'running' && <IconClock size="small" style={{ color: tone.fg }} />}
                          {step.status === 'pending' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg }} />}
                          {step.status === 'cancelled' && <div style={{ width: 8, height: 2, borderRadius: 9999, background: tone.fg }} />}
                        </div>

                        <div style={{
                          padding: 14,
                          borderRadius: 14,
                          background: step.status === 'running' ? 'var(--primary-50)' : 'var(--gray-50)',
                          border: `1px solid ${tone.border}`,
                          boxShadow: 'var(--shadow-sm)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                步骤 {index + 1} · {step.title}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                                {formatDateTime(step.startedAt)}
                                {step.endedAt ? ` - ${formatDateTime(step.endedAt)}` : ' - 进行中'}
                                <span style={{ marginLeft: 8 }}>耗时 {getStepDuration(step.startedAt, step.endedAt)}</span>
                              </div>
                            </div>
                            <Tag size="small" color={step.status === 'success' ? 'green' : step.status === 'failed' ? 'red' : step.status === 'running' ? 'blue' : 'grey'}>
                              {tone.text}
                            </Tag>
                          </div>

                          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                            <div style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>开始</div>
                              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {formatDateTime(step.startedAt)}
                              </div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>结束</div>
                              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {formatDateTime(step.endedAt)}
                              </div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>耗时</div>
                              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {getStepDuration(step.startedAt, step.endedAt)}
                              </div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>输入项</div>
                              <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {inputEntries.length} 项
                              </div>
                            </div>
                          </div>

                          {previewInputs.length > 0 && (
                            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {previewInputs.map(([key, value]) => (
                                <span
                                  key={key}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 9999,
                                    fontSize: 11,
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text-secondary)',
                                    border: '1px solid var(--color-border)'
                                  }}
                                >
                                  {key}: {formatStepValue(value)}
                                </span>
                              ))}
                              {inputEntries.length > previewInputs.length && (
                                <span style={{
                                  padding: '4px 8px',
                                  borderRadius: 9999,
                                  fontSize: 11,
                                  background: 'var(--gray-100)',
                                  color: 'var(--gray-600)'
                                }}>
                                  +{inputEntries.length - previewInputs.length}
                                </span>
                              )}
                            </div>
                          )}

                          {step.error && (
                            <div style={{
                              marginTop: 10,
                              padding: 10,
                              borderRadius: 10,
                              background: 'var(--error-50)',
                              border: '1px solid var(--error-200)',
                              fontSize: 12,
                              color: 'var(--error-700)',
                              lineHeight: 1.6
                            }}>
                              {step.error}
                            </div>
                          )}

                          {step.output && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                                输出预览
                              </div>
                              <pre style={{
                                margin: 0,
                                padding: 12,
                                borderRadius: 12,
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                fontSize: 12,
                                lineHeight: 1.6,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                maxHeight: 160,
                                overflow: 'auto'
                              }}>
                                {safeJson(step.output)}
                              </pre>
                            </div>
                          )}
                        </div>

                        {index < selectedTask.steps.length - 1 && (
                          <div style={{ height: 12 }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'var(--gray-50)',
                  border: '1px solid var(--color-border)',
                  fontSize: 13,
                  color: 'var(--color-text-tertiary)'
                }}>
                  暂无步骤信息
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '42px 20px', color: 'var(--color-text-tertiary)' }}>
            选中左侧任务后，这里会展示详细执行信息
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        title="确认删除"
        visible={deleteModal.visible}
        onOk={() => { if (deleteModal.taskId) handleDeleteTask(deleteModal.taskId) }}
        onCancel={() => setDeleteModal({ visible: false })}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ type: 'danger' }}
      >
        <p>确定要删除任务「{deleteModal.taskName}」吗？此操作不可恢复。</p>
      </Modal>
    </div>
  )
}
