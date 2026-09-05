import { useMemo, useState } from 'react'
import { Button, Input, Select, Tag, Toast } from '@douyinfe/semi-ui'
import { IconChevronDown, IconChevronUp, IconSearch, IconArrowLeft, IconArrowRight } from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'
import { TASK_MODE_CARDS, MODE_TO_ACTION, getActionLabel, getCaptureLabel } from '../../types'
import { StepIndicator, FormField, Card, showConfirm } from '../../components/ui'
import type { Step, StatusType } from '../../components/ui'
import styles from './NewTask.module.css'

const WIZARD_STEPS: Step[] = [
  { key: 'mode', label: '选择模式' },
  { key: 'detail', label: '填写详情' },
  { key: 'confirm', label: '确认运行' },
]

const SORT_OPTIONS = [
  { label: '综合排序', value: '0' },
  { label: '最新发布', value: '1' },
  { label: '点赞最多', value: '2' },
  { label: '评论最多', value: '3' },
  { label: '收藏最多', value: '4' },
]

const TIME_OPTIONS = [
  { label: '不限时间', value: '0' },
  { label: '一天内', value: '1' },
  { label: '一周内', value: '2' },
  { label: '半年内', value: '3' },
]

const NOTE_TYPE_OPTIONS = [
  { label: '全部', value: '0' },
  { label: '图文', value: '1' },
  { label: '视频', value: '2' },
]

const RANGE_OPTIONS = [
  { label: '不限', value: '0' },
  { label: '最近一天', value: '1' },
  { label: '最近一周', value: '2' },
  { label: '最近半年', value: '3' },
]

const DIST_OPTIONS = [
  { label: '不限', value: '0' },
  { label: '同城', value: '1' },
  { label: '附近', value: '2' },
]

function getTemplateUrl(template: DesktopTaskTemplate) {
  const params = template.defaultParams ?? {}
  return String(params.url ?? params.userUrl ?? '')
}

function getTemplateQuery(template: DesktopTaskTemplate) {
  const params = template.defaultParams ?? {}
  return String(params.query ?? '')
}

export default function NewTaskPage() {
  const {
    taskForm,
    setTaskForm,
    saving,
    setSaving,
    activeAccount,
    setActivePage,
    refreshAll,
    setSelectedTaskId,
    templates,
  } = useAppStore()

  const [step, setStep] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [templateFormName, setTemplateFormName] = useState('')

  const currentCookies = activeAccount?.cookiesStr ?? ''
  const activeCard = TASK_MODE_CARDS.find((card) => card.mode === taskForm.mode)

  const supportedTemplates = useMemo(
    () => templates
      .filter((template) =>
        ['note-info', 'video-note-info', 'user-all-notes', 'search-note', 'video-search-note'].includes(template.action)
      )
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [templates],
  )

  const validateStep = (s: number) => {
    const nextErrors: Record<string, string> = {}

    if (s === 0) {
      if (!taskForm.mode) nextErrors.mode = '请选择采集模式'
    }

    if (s === 1) {
      if (!taskForm.title.trim()) nextErrors.title = '请输入任务名称'
      if ((taskForm.mode === 'note' || taskForm.mode === 'user') && !taskForm.url.trim()) {
        nextErrors.url = '请输入链接'
      }
      if ((taskForm.mode === 'search' || taskForm.mode === 'video') && !taskForm.query.trim()) {
        nextErrors.query = '请输入搜索关键词'
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const goNext = () => {
    if (validateStep(step)) setStep(step + 1)
  }

  const goBack = () => {
    setErrors({})
    setStep(step - 1)
  }

  const createPayload = () => {
    if (taskForm.mode === 'note') return { url: taskForm.url }
    if (taskForm.mode === 'user') return { userUrl: taskForm.url }
    return {
      query: taskForm.query,
      requireNum: taskForm.requireNum,
      sortTypeChoice: taskForm.sortTypeChoice,
      noteType: taskForm.mode === 'video' ? 1 : taskForm.noteType,
      noteTime: taskForm.noteTime,
      noteRange: taskForm.noteRange,
      posDistance: taskForm.posDistance,
      geo: '',
    }
  }

  const handleStartTask = async () => {
    if (!currentCookies) {
      Toast.error('未配置账号 Cookie，请先去设置')
      return
    }

    setSaving(true)
    try {
      const action = taskForm.mode === 'note'
        ? (taskForm.title.includes('视频') ? 'video-note-info' : 'note-info')
        : MODE_TO_ACTION[taskForm.mode]

      const created = await window.desktopAPI.tasks.create({
        name: taskForm.title || `${getCaptureLabel(taskForm.mode)}采集`,
        action,
        params: createPayload(),
      })

      const run = await window.desktopAPI.tasks.run({
        taskId: created.id,
        cookiesStr: currentCookies,
      })

      await refreshAll()
      setActivePage('tasks')
      setSelectedTaskId(run?.id ?? created.id)
      Toast.success('任务已开始运行')
    } catch (error) {
      Toast.error(`启动失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTemplate = async () => {
    const name = templateFormName.trim() || taskForm.title.trim() || `${getCaptureLabel(taskForm.mode)}模板`
    const action = taskForm.mode === 'note'
      ? (taskForm.title.includes('视频') ? 'video-note-info' : 'note-info')
      : MODE_TO_ACTION[taskForm.mode]

    setSaving(true)
    try {
      await window.desktopAPI.tasks.upsertTemplate({
        name,
        action,
        description: activeCard?.desc ?? '',
        defaultParams: createPayload(),
      })
      await refreshAll()
      Toast.success('模板已保存')
    } catch (error) {
      Toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = (template: DesktopTaskTemplate) => {
    if (template.builtin) {
      Toast.warning('内置模板不支持删除')
      return
    }
    showConfirm({
      title: '删除模板',
      content: `确定删除模板「${template.name}」吗？`,
      danger: true,
      okText: '删除',
      onOk: async () => {
        await window.desktopAPI.tasks.removeTemplate(template.id)
        await refreshAll()
        Toast.success('已删除')
      },
    })
  }

  const applyTemplate = (template: DesktopTaskTemplate) => {
    const params = template.defaultParams ?? {}
    setTaskForm((prev) => ({
      ...prev,
      mode: template.action === 'video-search-note' ? 'video' : template.action === 'user-all-notes' ? 'user' : template.action === 'search-note' ? 'search' : 'note',
      title: template.name,
      url: getTemplateUrl(template),
      query: getTemplateQuery(template),
      requireNum: Number(params.requireNum ?? 10) || 10,
      sortTypeChoice: Number(params.sortTypeChoice ?? 0) || 0,
      noteType: Number(params.noteType ?? 0) || 0,
      noteTime: Number(params.noteTime ?? 0) || 0,
      noteRange: Number(params.noteRange ?? 0) || 0,
      posDistance: Number(params.posDistance ?? 0) || 0,
      videoOnly: template.action === 'video-search-note',
    }))
    setErrors({})
    setStep(1)
    Toast.success(`已套用：${template.name}`)
  }

  return (
    <div className={styles.root}>
      <div className={styles.wizard}>
        <StepIndicator steps={WIZARD_STEPS} current={step} />

        {/* Step 0: Choose Mode */}
        {step === 0 && (
          <div className={styles.stepContent}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>选择采集模式</h2>
              <p style={{ marginTop: 8, color: 'var(--color-text-tertiary)', fontSize: 14 }}>
                根据目标选择最佳采集方式
              </p>
            </div>

            <div className={styles.modeGrid}>
              {TASK_MODE_CARDS.map((card) => {
                const isActive = taskForm.mode === card.mode
                return (
                  <div
                    key={card.mode}
                    className={`${styles.modeCard} ${isActive ? styles.modeCardActive : ''}`}
                    onClick={() => {
                      setTaskForm((prev) => ({ ...prev, mode: card.mode }))
                      setErrors({})
                    }}
                  >
                    {isActive && <div className={styles.activeDot} />}
                    <div className={styles.modeIcon}>{card.icon}</div>
                    <div className={styles.modeTitle}>{card.title}</div>
                    <div className={styles.modeDesc}>{card.desc}</div>
                  </div>
                )
              })}
            </div>

            {errors.mode && (
              <div style={{ color: 'var(--error-500)', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{errors.mode}</div>
            )}

            {/* Templates quick-select */}
            {supportedTemplates.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 8, textAlign: 'center' }}>
                  或从模板快速开始
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {supportedTemplates.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 9999,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      {t.name}
                      {t.builtin && <Tag size="small" color="blue" style={{ marginLeft: 6 }}>内置</Tag>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.stepNav}>
              <div />
              <Button type="primary" size="large" onClick={goNext} icon={<IconArrowRight />}>
                下一步
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Fill Details */}
        {step === 1 && (
          <div className={styles.stepContent}>
            <div className={styles.formCard}>
              <div className={styles.formCardHeader}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{activeCard?.title}采集</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{activeCard?.desc}</div>
                </div>
                <div className={styles.accountBadge}>
                  <span className={styles.accountDot} style={{ background: activeAccount ? 'var(--success-500)' : 'var(--gray-400)' }} />
                  {activeAccount?.name || '未选择账号'}
                </div>
              </div>

              <div className={styles.formCardBody}>
                <div className={styles.formGrid}>
                  <FormField label="任务名称" required error={errors.title}>
                    <Input
                      value={taskForm.title}
                      onChange={(value: string) => { setTaskForm((prev) => ({ ...prev, title: value })); if (errors.title) setErrors((p) => ({ ...p, title: '' })) }}
                      placeholder={`${activeCard?.title}采集任务`}
                    />
                  </FormField>

                  {(taskForm.mode === 'note' || taskForm.mode === 'user') && (
                    <FormField
                      label={taskForm.mode === 'note' ? '笔记链接' : '用户主页链接'}
                      required
                      error={errors.url}
                      hint={taskForm.mode === 'note' ? '粘贴小红书笔记链接，支持图文和视频笔记。' : '粘贴用户主页链接，采集该用户发布的所有笔记。'}
                    >
                      <Input
                        value={taskForm.url}
                        onChange={(value: string) => { setTaskForm((prev) => ({ ...prev, url: value })); if (errors.url) setErrors((p) => ({ ...p, url: '' })) }}
                        placeholder={taskForm.mode === 'note' ? 'https://www.xiaohongshu.com/explore/...' : 'https://www.xiaohongshu.com/user/profile/...'}
                      />
                    </FormField>
                  )}

                  {(taskForm.mode === 'search' || taskForm.mode === 'video') && (
                    <>
                      <FormField label="搜索关键词" required error={errors.query}>
                        <Input
                          value={taskForm.query}
                          onChange={(value: string) => { setTaskForm((prev) => ({ ...prev, query: value })); if (errors.query) setErrors((p) => ({ ...p, query: '' })) }}
                          placeholder="例如：露营、口红、穿搭..."
                        />
                      </FormField>

                      <div className={styles.formRow}>
                        <FormField label="采集数量">
                          <Input value={String(taskForm.requireNum)} onChange={(value: string) => setTaskForm((prev) => ({ ...prev, requireNum: Number(value) || 1 }))} />
                        </FormField>
                        <FormField label="排序方式">
                          <Select value={String(taskForm.sortTypeChoice)} optionList={SORT_OPTIONS} onChange={(value) => setTaskForm((prev) => ({ ...prev, sortTypeChoice: Number(value) }))} style={{ width: '100%' }} />
                        </FormField>
                        <FormField label="时间范围">
                          <Select value={String(taskForm.noteTime)} optionList={TIME_OPTIONS} onChange={(value) => setTaskForm((prev) => ({ ...prev, noteTime: Number(value) }))} style={{ width: '100%' }} />
                        </FormField>
                      </div>
                    </>
                  )}

                  <div className={styles.advancedToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
                    <span>高级参数</span>
                    {showAdvanced ? <IconChevronUp size="small" /> : <IconChevronDown size="small" />}
                  </div>

                  {showAdvanced && (
                    <div className={styles.advancedGrid}>
                      <FormField label="笔记类型">
                        <Select value={String(taskForm.noteType)} optionList={NOTE_TYPE_OPTIONS} onChange={(value) => setTaskForm((prev) => ({ ...prev, noteType: Number(value) }))} style={{ width: '100%' }} />
                      </FormField>
                      <FormField label="搜索范围">
                        <Select value={String(taskForm.noteRange)} optionList={RANGE_OPTIONS} onChange={(value) => setTaskForm((prev) => ({ ...prev, noteRange: Number(value) }))} style={{ width: '100%' }} />
                      </FormField>
                      <FormField label="位置距离">
                        <Select value={String(taskForm.posDistance)} optionList={DIST_OPTIONS} onChange={(value) => setTaskForm((prev) => ({ ...prev, posDistance: Number(value) }))} style={{ width: '100%' }} />
                      </FormField>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.stepNav}>
              <Button onClick={goBack} icon={<IconArrowLeft />}>上一步</Button>
              <Button type="primary" size="large" onClick={goNext} icon={<IconArrowRight />}>
                下一步
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Confirm & Run */}
        {step === 2 && (
          <div className={styles.stepContent}>
            <div className={styles.confirmCard}>
              <div className={styles.confirmCardHeader}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>确认任务信息</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>检查无误后开始采集</div>
                </div>
                <span className={styles.accountBadge}>
                  <span className={styles.accountDot} style={{ background: activeAccount ? 'var(--success-500)' : 'var(--gray-400)' }} />
                  {activeAccount?.name || '未选择账号'}
                </span>
              </div>

              <div className={styles.confirmCardBody}>
                {/* Summary */}
                <div className={styles.summaryRow}>
                  <div className={styles.summaryIcon}>{activeCard?.icon}</div>
                  <div className={styles.summaryInfo}>
                    <div className={styles.summaryLabel}>任务名称</div>
                    <div className={styles.summaryValue}>{taskForm.title || `${activeCard?.title}采集`}</div>
                  </div>
                </div>

                {/* Parameters */}
                <div className={styles.paramGrid}>
                  <div className={styles.paramItem}>
                    <div className={styles.paramLabel}>模式</div>
                    <div className={styles.paramValue}>{activeCard?.title}</div>
                  </div>
                  {(taskForm.mode === 'note' || taskForm.mode === 'user') && (
                    <div className={styles.paramItem}>
                      <div className={styles.paramLabel}>{taskForm.mode === 'note' ? '笔记链接' : '用户链接'}</div>
                      <div className={styles.paramValue} style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{taskForm.url}</div>
                    </div>
                  )}
                  {(taskForm.mode === 'search' || taskForm.mode === 'video') && (
                    <>
                      <div className={styles.paramItem}>
                        <div className={styles.paramLabel}>关键词</div>
                        <div className={styles.paramValue}>{taskForm.query}</div>
                      </div>
                      <div className={styles.paramItem}>
                        <div className={styles.paramLabel}>数量</div>
                        <div className={styles.paramValue}>{taskForm.requireNum}</div>
                      </div>
                      <div className={styles.paramItem}>
                        <div className={styles.paramLabel}>排序</div>
                        <div className={styles.paramValue}>{SORT_OPTIONS[taskForm.sortTypeChoice]?.label ?? '综合'}</div>
                      </div>
                      <div className={styles.paramItem}>
                        <div className={styles.paramLabel}>时间</div>
                        <div className={styles.paramValue}>{TIME_OPTIONS[taskForm.noteTime]?.label ?? '不限'}</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Template save */}
                <div className={styles.templateSection}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>保存为模板</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input
                      value={templateFormName}
                      onChange={(v: string) => setTemplateFormName(v)}
                      placeholder={`${activeCard?.title}模板`}
                      style={{ flex: 1 }}
                    />
                    <Button loading={saving} onClick={handleSaveTemplate}>
                      保存模板
                    </Button>
                  </div>
                </div>

                {/* Account warning */}
                {!activeAccount && (
                  <div className={styles.accountWarn}>
                    <div className={styles.accountWarnHeader}>
                      <span style={{ fontSize: 18 }}>⚠️</span>
                      未配置账号
                    </div>
                    <div className={styles.accountWarnText}>
                      请先在设置中添加小红书账号 Cookie，否则无法采集数据。
                    </div>
                    <Button type="primary" size="small" onClick={() => setActivePage('settings')}>
                      去设置账号
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.stepNav}>
              <Button onClick={goBack} icon={<IconArrowLeft />}>上一步</Button>
              <Button
                type="primary"
                size="large"
                icon={<IconSearch />}
                loading={saving}
                onClick={handleStartTask}
                theme="solid"
              >
                开始采集
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
