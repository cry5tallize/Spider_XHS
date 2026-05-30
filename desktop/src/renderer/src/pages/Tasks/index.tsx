import { useEffect, useMemo, useState } from 'react'
import { Button, SideSheet, Select, Toast, Progress, Input, Checkbox } from '@douyinfe/semi-ui'
import {
  IconPlus,
  IconPlayCircle,
  IconDownload,
  IconDelete,
  IconRefresh,
  IconTickCircle,
  IconAlertCircle,
  IconClock,
  IconSearch,
  IconClear,
} from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'
import { getActionLabel, isVideoTask, safeJson } from '../../types'
import { StatusBadge, StatusDot, Card, EmptyState, PageHeader, showConfirm, StepTimeline } from '../../components/ui'
import type { StatusType, TimelineStep } from '../../components/ui'
import { useDebounce } from '../../hooks'
import styles from './Tasks.module.css'

function formatDateTime(value: string) {
  if (!value) return '未开始'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function getTaskNote(task: DesktopTaskRun) {
  const normalizedResult = task.normalizedResult as Record<string, unknown> | null
  const normalized = normalizedResult?.normalized
  return normalized && typeof normalized === 'object' ? (normalized as StandardNote) : null
}

function getVideoStreamOptions(task: DesktopTaskRun) {
  const note = getTaskNote(task)
  const streams = note?.videoStreams ?? []
  const options = streams.map((stream) => ({ label: `${stream.videoCodec || 'unknown'} · ${stream.width}x${stream.height} · ${Math.round(stream.avgBitrate / 1000)}kbps${stream.defaultStream ? ' · 默认' : ''}`, value: stream.masterUrl }))
  if (options.length > 0) return options
  return note?.videoAddr ? [{ label: '默认流', value: note.videoAddr }] : []
}

export default function TasksPage() {
  const {
    tasks,
    taskFilter, setTaskFilter,
    taskSearchQuery, setTaskSearchQuery,
    selectedTaskIds, toggleTaskSelection, clearTaskSelection,
    saving, setSaving,
    setActivePage,
    selectedTaskId, setSelectedTaskId,
    refreshAll,
    activeAccount,
  } = useAppStore()

  const [videoStreamByTaskId, setVideoStreamByTaskId] = useState<Record<string, string>>({})
  const [exportProgress, setExportProgress] = useState<DesktopDownloadProgress | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const debouncedSearch = useDebounce(taskSearchQuery, 250)
  const currentCookies = activeAccount?.cookiesStr ?? ''

  // Filter + search
  const filteredTasks = useMemo(() => {
    let result = tasks.filter((task) => {
      if (taskFilter === 'all') return true
      const video = isVideoTask(task)
      return taskFilter === 'video' ? video : !video
    })

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q) || t.action.toLowerCase().includes(q))
    }

    return result
  }, [tasks, taskFilter, debouncedSearch])

  // Group
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const groupedTasks = useMemo(() => {
    const groups: Record<string, typeof filteredTasks> = {}
    for (const task of filteredTasks) {
      const taskDate = new Date(task.createdAt).toDateString()
      let group = '更早'
      if (taskDate === today) group = '今天'
      else if (taskDate === yesterday) group = '昨天'
      if (!groups[group]) groups[group] = []
      groups[group].push(task)
    }
    return groups
  }, [filteredTasks, today, yesterday])

  const groupOrder = ['今天', '昨天', '更早']

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  )

  const selectedTaskNote = useMemo(() => (selectedTask ? getTaskNote(selectedTask) : null), [selectedTask])
  const selectedVideoStreamOptions = useMemo(() => (selectedTask ? getVideoStreamOptions(selectedTask) : []), [selectedTask])
  const selectedVideoStreamUrl = selectedTask
    ? (videoStreamByTaskId[selectedTask.id] ?? selectedVideoStreamOptions[0]?.value ?? '')
    : ''

  useEffect(() => {
    if (!selectedTask || selectedTaskNote?.noteType !== '视频' || selectedVideoStreamOptions.length === 0) return
    const current = videoStreamByTaskId[selectedTask.id]
    const valid = current && selectedVideoStreamOptions.some((item) => item.value === current)
    if (!valid) {
      setVideoStreamByTaskId((state) => ({ ...state, [selectedTask.id]: selectedVideoStreamOptions[0].value }))
    }
  }, [selectedTask, selectedTaskNote, selectedVideoStreamOptions, videoStreamByTaskId])

  useEffect(() => {
    return window.desktopAPI.tasks.onExportProgress((progress) => setExportProgress(progress))
  }, [])

  // Timeline steps
  const timelineSteps = useMemo((): TimelineStep[] => {
    if (!selectedTask) return []
    return (selectedTask.steps ?? []).map((step) => ({
      id: step.id,
      title: step.title,
      status: step.status as StatusType,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      duration: (() => { const d = new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime(); if (d < 0 || Number.isNaN(d)) return '进行中'; const s = Math.max(0, Math.round(d / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s` })(),
      inputEntries: Object.entries(step.input ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      error: step.error,
      output: step.output,
    }))
  }, [selectedTask])

  // Actions
  const handleRunTask = async (taskId: string) => {
    setSaving(true)
    try {
      await window.desktopAPI.tasks.run({ taskId, cookiesStr: currentCookies })
      await refreshAll()
      setSelectedTaskId(taskId)
      Toast.success('任务已运行')
    } catch (error) { Toast.error(`运行失败: ${error instanceof Error ? error.message : '未知'}`) }
    finally { setSaving(false) }
  }

  const handleExportTask = async (taskId: string, videoStreamUrl?: string) => {
    setSaving(true); try {
      const result = await window.desktopAPI.tasks.export({ taskId, videoStreamUrl })
      Toast.success(result?.exportPath ? `已导出到 ${result.exportPath}` : '已导出')
    } catch (error) { Toast.error(`导出失败: ${error instanceof Error ? error.message : '未知'}`) }
    finally { setSaving(false) }
  }

  const handleRetryTask = async (taskId: string) => {
    setSaving(true); try {
      await window.desktopAPI.tasks.retry({ taskId, cookiesStr: currentCookies })
      await refreshAll(); setSelectedTaskId(taskId); Toast.success('已重试')
    } catch (error) { Toast.error(`重试失败: ${error instanceof Error ? error.message : '未知'}`) }
    finally { setSaving(false) }
  }

  const handleRerunTask = async (taskId: string) => {
    setSaving(true); try {
      await window.desktopAPI.tasks.rerun({ taskId, cookiesStr: currentCookies })
      await refreshAll(); setSelectedTaskId(taskId); Toast.success('已复制并重新运行')
    } catch (error) { Toast.error(`失败: ${error instanceof Error ? error.message : '未知'}`) }
    finally { setSaving(false) }
  }

  const handleReparseTask = async (taskId: string) => {
    setSaving(true); try {
      await window.desktopAPI.tasks.reparse({ taskId })
      await refreshAll(); Toast.success('已重新解析')
    } catch (error) { Toast.error(`失败: ${error instanceof Error ? error.message : '未知'}`) }
    finally { setSaving(false) }
  }

  const handleCancelTask = async (taskId: string) => {
    setSaving(true); try {
      await window.desktopAPI.tasks.cancel({ taskId })
      await refreshAll(); Toast.success('已取消')
    } catch (error) { Toast.error(`取消失败: ${error instanceof Error ? error.message : '未知'}`) }
    finally { setSaving(false) }
  }

  const handleDeleteTask = (taskId: string, name: string) => {
    showConfirm({ title: '删除任务', content: `确定删除「${name}」吗？此操作不可恢复。`, danger: true, okText: '删除',
      onOk: async () => {
        await window.desktopAPI.tasks.remove({ taskId })
        await refreshAll(); if (selectedTaskId === taskId) setSelectedTaskId(null)
        Toast.success('已删除')
      },
    })
  }

  const handleBatchDelete = () => {
    if (selectedTaskIds.length === 0) return
    showConfirm({ title: '批量删除', content: `确定删除 ${selectedTaskIds.length} 个任务吗？此操作不可恢复。`, danger: true, okText: '删除',
      onOk: async () => {
        await window.desktopAPI.tasks.batchRemove(selectedTaskIds)
        await refreshAll(); clearTaskSelection(); Toast.success(`已删除 ${selectedTaskIds.length} 个任务`)
      },
    })
  }

  const handleBatchExport = async () => {
    if (selectedTaskIds.length === 0) return
    setSaving(true); try {
      await window.desktopAPI.tasks.batchExport(selectedTaskIds)
      Toast.success(`已批量导出 ${selectedTaskIds.length} 个任务`)
    } catch (error) { Toast.error(`导出失败: ${error instanceof Error ? error.message : '未知'}`) }
    finally { setSaving(false) }
  }

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group); else next.add(group)
      return next
    })
  }

  const allFilteredIds = useMemo(() => filteredTasks.map((t) => t.id), [filteredTasks])
  const isAllSelected = selectedTaskIds.length > 0 && selectedTaskIds.length === allFilteredIds.length && allFilteredIds.length > 0

  const drawerVisible = selectedTask !== null

  return (
    <div className={styles.root}>
      <PageHeader
        title="任务管理"
        subtitle="查看和管理所有采集任务"
        actions={
          <Button type="primary" icon={<IconPlus />} onClick={() => setActivePage('newTask')}>
            新建任务
          </Button>
        }
      />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Input
            prefix={<IconSearch />}
            suffix={taskSearchQuery ? <IconClear style={{ cursor: 'pointer' }} onClick={() => setTaskSearchQuery('')} /> : undefined}
            value={taskSearchQuery}
            onChange={(v: string) => setTaskSearchQuery(v)}
            placeholder="搜索任务名称或类型..."
          />
        </div>
        <div className={styles.filterTabs}>
          {(['all', 'video', 'normal'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`${styles.filterTab} ${taskFilter === item ? styles.filterTabActive : ''}`}
              onClick={() => setTaskFilter(item)}
            >
              {item === 'all' ? '全部' : item === 'video' ? '视频' : '普通'}
            </button>
          ))}
        </div>
        <Button size="small" type="tertiary" icon={<IconRefresh />} onClick={refreshAll}>
          刷新
        </Button>
      </div>

      {/* Batch bar */}
      {selectedTaskIds.length > 0 && (
        <div className={styles.batchBar}>
          <Checkbox checked={isAllSelected} indeterminate={!isAllSelected} onChange={() => isAllSelected ? clearTaskSelection() : useAppStore.getState().selectAllTasks(allFilteredIds)} />
          <span className={styles.batchCount}>已选 {selectedTaskIds.length} 项</span>
          <Button size="small" type="tertiary" onClick={handleBatchExport} loading={saving}>批量导出</Button>
          <Button size="small" type="danger" onClick={handleBatchDelete} loading={saving} icon={<IconDelete />}>批量删除</Button>
          <Button size="small" type="tertiary" onClick={clearTaskSelection}>取消选择</Button>
        </div>
      )}

      {/* Task list */}
      {filteredTasks.length > 0 ? (
        <div className={styles.taskList}>
          {groupOrder.map((group) => {
            const groupTasks = groupedTasks[group]
            if (!groupTasks || groupTasks.length === 0) return null
            const isCollapsed = collapsedGroups.has(group)

            return (
              <div key={group}>
                <div className={styles.groupHeader} onClick={() => toggleGroup(group)}>
                  <span>{group}</span>
                  <span className={styles.groupCount}>
                    {groupTasks.length} 个任务 {isCollapsed ? '▸' : '▾'}
                  </span>
                </div>

                {!isCollapsed && groupTasks.map((task) => {
                  const isSelected = selectedTaskId === task.id
                  const isChecked = selectedTaskIds.includes(task.id)
                  const note = getTaskNote(task)

                  return (
                    <div
                      key={task.id}
                      className={`${styles.taskRow} ${isSelected ? styles.taskRowSelected : ''}`}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <div className={styles.checkCell} onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isChecked} onChange={() => toggleTaskSelection(task.id)} />
                      </div>
                      <div className={styles.statusCell}>
                        {task.status === 'success' && <IconTickCircle size="small" style={{ color: 'var(--success-500)' }} />}
                        {task.status === 'failed' && <IconAlertCircle size="small" style={{ color: 'var(--error-500)' }} />}
                        {task.status === 'running' && <IconClock size="small" style={{ color: 'var(--primary-500)' }} />}
                        {task.status === 'pending' && <StatusDot status="pending" />}
                        {task.status === 'cancelled' && <StatusDot status="cancelled" />}
                      </div>
                      <div className={styles.contentCell}>
                        <div className={styles.taskName}>{task.name}</div>
                        <div className={styles.taskMeta}>
                          <span>{getActionLabel(task.action)}</span>
                          <span className={styles.metaDivider}>|</span>
                          <span>{task.createdAt}</span>
                          {task.status === 'running' && (
                            <>
                              <span className={styles.metaDivider}>|</span>
                              <span style={{ color: 'var(--primary-500)' }}>进度 {task.progress}%</span>
                            </>
                          )}
                        </div>
                        {task.status === 'running' && (
                          <div className={styles.progressMini}>
                            <div className={styles.progressFill} style={{ width: `${task.progress}%` }} />
                          </div>
                        )}
                      </div>
                      <StatusBadge status={task.status as StatusType} />
                      <div className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                        {task.status === 'running' ? (
                          <Button size="small" type="tertiary" onClick={() => handleCancelTask(task.id)} loading={saving}>取消</Button>
                        ) : task.status === 'failed' || task.status === 'cancelled' ? (
                          <Button size="small" type="tertiary" onClick={() => handleRetryTask(task.id)} loading={saving}>重试</Button>
                        ) : (
                          <Button size="small" type="tertiary" onClick={() => handleRunTask(task.id)} loading={saving}>运行</Button>
                        )}
                        <Button size="small" type="tertiary" onClick={() => handleExportTask(task.id, videoStreamByTaskId[task.id])} loading={saving}>导出</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<IconSearch style={{ fontSize: 28 }} />}
          title="暂无任务"
          description="还没有符合条件的任务，点击右上角新建按钮创建你的第一个任务"
          action={<Button type="primary" icon={<IconPlus />} onClick={() => setActivePage('newTask')}>新建任务</Button>}
        />
      )}

      {/* Task Detail Drawer */}
      <SideSheet
        title={null}
        visible={drawerVisible}
        onCancel={() => setSelectedTaskId(null)}
        width={560}
        bodyStyle={{ padding: '24px' }}
      >
        {selectedTask && (
          <>
            {/* Header */}
            <div className={styles.drawerHeader}>
              <div>
                <h2 className={styles.drawerTitle}>{selectedTask.name}</h2>
                <div className={styles.drawerSubtitle}>
                  {getActionLabel(selectedTask.action)} · {selectedTask.templateId ? '来自模板' : '手动创建'}
                </div>
              </div>
              <StatusBadge status={selectedTask.status as StatusType} />
            </div>

            {/* Stats */}
            <div className={styles.drawerStats}>
              <div className={styles.drawerStat}>
                <div className={styles.drawerStatLabel}>创建时间</div>
                <div className={styles.drawerStatValue}>{formatDateTime(selectedTask.createdAt)}</div>
              </div>
              <div className={styles.drawerStat}>
                <div className={styles.drawerStatLabel}>更新时间</div>
                <div className={styles.drawerStatValue}>{formatDateTime(selectedTask.updatedAt)}</div>
              </div>
              <div className={styles.drawerStat}>
                <div className={styles.drawerStatLabel}>进度</div>
                <div className={styles.drawerStatValue}>{selectedTask.progress}%</div>
              </div>
              <div className={styles.drawerStat}>
                <div className={styles.drawerStatLabel}>重试次数</div>
                <div className={styles.drawerStatValue}>{selectedTask.retryCount} 次</div>
              </div>
            </div>

            {/* Progress bar */}
            {selectedTask.status === 'running' && (
              <div style={{ marginBottom: 20 }}>
                <Progress percent={selectedTask.progress} showInfo />
              </div>
            )}

            {/* Actions */}
            <div className={styles.drawerActions}>
              {selectedTask.status === 'running' ? (
                <Button type="primary" loading={saving} onClick={() => handleCancelTask(selectedTask.id)}>取消任务</Button>
              ) : selectedTask.status === 'failed' || selectedTask.status === 'cancelled' ? (
                <Button type="primary" loading={saving} onClick={() => handleRetryTask(selectedTask.id)}>重试任务</Button>
              ) : (
                <Button type="primary" loading={saving} onClick={() => handleRunTask(selectedTask.id)}>重新运行</Button>
              )}
              <Button type="tertiary" loading={saving} onClick={() => handleRerunTask(selectedTask.id)}>复制再跑</Button>
              <Button type="tertiary" loading={saving} disabled={!selectedTask.rawResult} onClick={() => handleReparseTask(selectedTask.id)}>重新解析</Button>
              <Button type="tertiary" loading={saving} onClick={() => handleExportTask(selectedTask.id, selectedVideoStreamUrl)}>导出结果</Button>
              <Button type="danger" loading={saving} onClick={() => handleDeleteTask(selectedTask.id, selectedTask.name)}>删除</Button>
            </div>

            {/* Params + Results */}
            <div className={styles.drawerSection}>
              <div className={styles.resultGrid}>
                <div>
                  <div className={styles.sectionTitle}>参数</div>
                  <pre className={styles.codeBlock}>{safeJson(selectedTask.params)}</pre>
                </div>
                <div>
                  <div className={styles.sectionTitle}>标准化结果</div>
                  <pre className={styles.codeBlock}>{safeJson(selectedTask.normalizedResult ?? selectedTask.result ?? {})}</pre>
                </div>
              </div>
            </div>

            {/* Video stream selector */}
            {selectedTaskNote?.noteType === '视频' && selectedVideoStreamOptions.length > 0 && (
              <div className={`${styles.drawerSection} ${styles.exportSection}`}>
                <div className={styles.exportTitle}>导出视频流</div>
                <div className={styles.exportHint}>选择后，导出结果中的视频文件会使用该流。</div>
                <Select
                  value={selectedVideoStreamUrl || selectedVideoStreamOptions[0]?.value}
                  optionList={selectedVideoStreamOptions}
                  onChange={(value) => setVideoStreamByTaskId((state) => ({ ...state, [selectedTask.id]: String(value ?? '') }))}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {/* Export progress */}
            {exportProgress && (
              <div className={`${styles.drawerSection} ${styles.exportSection}`}>
                <div className={styles.exportTitle}>导出进度</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{exportProgress.message}</div>
                <Progress percent={exportProgress.percent} showInfo />
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  当前文件: {exportProgress.currentFile || '-'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {exportProgress.currentPercent !== null ? `单文件进度: ${exportProgress.currentPercent}%` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {formatBytes(exportProgress.currentDownloadedBytes)}{exportProgress.currentTotalBytes ? ` / ${formatBytes(exportProgress.currentTotalBytes)}` : ''}
                </div>
              </div>
            )}

            {/* Steps timeline */}
            <div className={styles.drawerSection}>
              <div className={styles.sectionTitle}>
                执行步骤
                {timelineSteps.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                    共 {timelineSteps.length} 步，已完成 {timelineSteps.filter((s) => s.status === 'success').length} 步
                  </span>
                )}
              </div>
              {timelineSteps.length > 0 ? (
                <StepTimeline steps={timelineSteps} />
              ) : (
                <div style={{ padding: 16, borderRadius: 12, background: 'var(--gray-50)', border: '1px solid var(--color-border)', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  暂无步骤信息
                </div>
              )}
            </div>
          </>
        )}
      </SideSheet>
    </div>
  )
}
