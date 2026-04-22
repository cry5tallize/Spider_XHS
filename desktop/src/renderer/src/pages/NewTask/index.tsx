import { useMemo, useState } from 'react'
import { Button, Input, Modal, Select, Tag, Toast } from '@douyinfe/semi-ui'
import { IconArrowRight, IconChevronDown, IconChevronUp, IconSearch } from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'
import { TASK_MODE_CARDS, MODE_TO_ACTION, getActionLabel, getCaptureLabel } from '../../types'

function resolveTemplateMode(action: DesktopTaskAction) {
  switch (action) {
    case 'note-info':
    case 'video-note-info':
      return 'note' as const
    case 'user-all-notes':
      return 'user' as const
    case 'search-note':
      return 'search' as const
    case 'video-search-note':
      return 'video' as const
    default:
      return null
  }
}

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

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [templateName, setTemplateName] = useState(() => taskForm.title.trim() || `${getCaptureLabel(taskForm.mode)}模板`)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)

  const currentCookies = activeAccount?.cookiesStr ?? ''
  const activeCard = TASK_MODE_CARDS.find((card) => card.mode === taskForm.mode)

  const supportedTemplates = useMemo(
    () => templates
      .filter((template) => resolveTemplateMode(template.action))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [templates],
  )

  const defaultTemplateName = `${getCaptureLabel(taskForm.mode)}模板`

  const validate = () => {
    const nextErrors: Record<string, boolean> = {}

    if (!taskForm.title.trim()) {
      nextErrors.title = true
    }

    if ((taskForm.mode === 'note' || taskForm.mode === 'user') && !taskForm.url.trim()) {
      nextErrors.url = true
    }

    if ((taskForm.mode === 'search' || taskForm.mode === 'video') && !taskForm.query.trim()) {
      nextErrors.query = true
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const createPayload = () => {
    if (taskForm.mode === 'note') {
      return { url: taskForm.url }
    }

    if (taskForm.mode === 'user') {
      return { userUrl: taskForm.url }
    }

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

  const applyTemplate = (template: DesktopTaskTemplate) => {
    const mode = resolveTemplateMode(template.action)
    if (!mode) {
      Toast.warning('当前模板暂不支持套用')
      return
    }

    const params = template.defaultParams ?? {}
    setTaskForm((prev) => ({
      ...prev,
      mode,
      title: template.name,
      url: getTemplateUrl(template),
      query: getTemplateQuery(template),
      requireNum: Number(params.requireNum ?? prev.requireNum ?? 10) || 10,
      sortTypeChoice: Number(params.sortTypeChoice ?? prev.sortTypeChoice ?? 0) || 0,
      noteType: Number(params.noteType ?? prev.noteType ?? 0) || 0,
      noteTime: Number(params.noteTime ?? prev.noteTime ?? 0) || 0,
      noteRange: Number(params.noteRange ?? prev.noteRange ?? 0) || 0,
      posDistance: Number(params.posDistance ?? prev.posDistance ?? 0) || 0,
      videoOnly: mode === 'video',
    }))
    setErrors({})
    setShowAdvanced(mode === 'search' || mode === 'video')
    setTemplateName(template.name)
    setEditingTemplateId(null)
    Toast.success(`已套用模板：${template.name}`)
  }

  const handleSaveTemplate = async () => {
    const action = taskForm.mode === 'note'
      ? (taskForm.title.includes('视频') ? 'video-note-info' : 'note-info')
      : MODE_TO_ACTION[taskForm.mode]

    const nextName = templateName.trim() || taskForm.title.trim() || defaultTemplateName

    setSaving(true)
    try {
      await window.desktopAPI.tasks.upsertTemplate({
        id: editingTemplateId ?? undefined,
        name: nextName,
        action,
        description: activeCard?.desc ?? '',
        defaultParams: createPayload(),
      })
      await refreshAll()
      setEditingTemplateId(null)
      setTemplateName(nextName)
      Toast.success(editingTemplateId ? '模板已更新' : '模板已保存')
    } catch (error) {
      Toast.error(`保存模板失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleEditTemplate = (template: DesktopTaskTemplate) => {
    if (template.builtin) {
      Toast.warning('内置模板不支持重命名')
      return
    }

    setEditingTemplateId(template.id)
    setTemplateName(template.name)
  }

  const handleDeleteTemplate = (template: DesktopTaskTemplate) => {
    if (template.builtin) {
      Toast.warning('内置模板不支持删除')
      return
    }

    Modal.confirm({
      title: '删除模板',
      content: `确定删除模板“${template.name}”吗？此操作不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        setSaving(true)
        try {
          await window.desktopAPI.tasks.removeTemplate(template.id)
          await refreshAll()
          if (editingTemplateId === template.id) {
            setEditingTemplateId(null)
            setTemplateName(defaultTemplateName)
          }
          Toast.success('模板已删除')
        } catch (error) {
          Toast.error(`删除模板失败: ${error instanceof Error ? error.message : '未知错误'}`)
          throw error
        } finally {
          setSaving(false)
        }
      },
    })
  }

  const handleStartTask = async () => {
    if (!validate()) {
      const missing = Object.keys(errors).join('、')
      Toast.error(`请填写必填项：${missing}`)
      return
    }

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

  const inputStyle = (field: string) => ({
    width: '100%',
    borderColor: errors[field] ? 'var(--error-500)' : undefined,
    boxShadow: errors[field] ? '0 0 0 2px var(--error-100)' : undefined,
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            采集模式
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {TASK_MODE_CARDS.map((card) => {
              const isActive = taskForm.mode === card.mode
              return (
                <div
                  key={card.mode}
                  onClick={() => {
                    setTaskForm((prev) => ({ ...prev, mode: card.mode }))
                    setErrors({})
                  }}
                  style={{
                    padding: '20px 16px',
                    borderRadius: 12,
                    border: `2px solid ${isActive ? 'var(--primary-500)' : 'var(--color-border)'}`,
                    background: isActive ? 'var(--primary-50)' : 'var(--color-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'var(--primary-300)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'var(--color-border)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  {isActive && (
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-500)' }} />
                  )}
                  <div style={{ fontSize: 32, marginBottom: 10 }}>{card.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: 'var(--color-text-primary)' }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                    {card.desc}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{activeCard?.title}采集</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{activeCard?.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--gray-100)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeAccount ? 'var(--success-500)' : 'var(--gray-400)' }} />
              {activeAccount?.name || '未选择账号'}
            </div>
          </div>

          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  任务名称 <span style={{ color: 'var(--error-500)' }}>*</span>
                </label>
                <Input
                  value={taskForm.title}
                  onChange={(value: string) => {
                    setTaskForm((prev) => ({ ...prev, title: value }))
                    if (errors.title) setErrors((p) => ({ ...p, title: false }))
                  }}
                  placeholder={`${activeCard?.title}采集任务`}
                  style={inputStyle('title')}
                />
                {errors.title && <div style={{ fontSize: 12, color: 'var(--error-500)', marginTop: 4 }}>请输入任务名称</div>}
              </div>

              {(taskForm.mode === 'note' || taskForm.mode === 'user') && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                    {taskForm.mode === 'note' ? '笔记链接' : '用户主页链接'}
                    <span style={{ color: 'var(--error-500)' }}>*</span>
                  </label>
                  <Input
                    value={taskForm.url}
                    onChange={(value: string) => {
                      setTaskForm((prev) => ({ ...prev, url: value }))
                      if (errors.url) setErrors((p) => ({ ...p, url: false }))
                    }}
                    placeholder={taskForm.mode === 'note' ? 'https://www.xiaohongshu.com/explore/...' : 'https://www.xiaohongshu.com/user/profile/...'}
                    style={inputStyle('url')}
                  />
                  {errors.url && <div style={{ fontSize: 12, color: 'var(--error-500)', marginTop: 4 }}>请输入链接</div>}
                  <div style={{ fontSize: 12, color: 'var(--color-text-quaternary)', marginTop: 6, lineHeight: 1.5 }}>
                    {taskForm.mode === 'note'
                      ? '粘贴小红书笔记链接，支持图文和视频笔记。'
                      : '粘贴用户主页链接，采集该用户发布的所有笔记。'}
                  </div>
                </div>
              )}

              {(taskForm.mode === 'search' || taskForm.mode === 'video') && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                      搜索关键词 <span style={{ color: 'var(--error-500)' }}>*</span>
                    </label>
                    <Input
                      value={taskForm.query}
                      onChange={(value: string) => {
                        setTaskForm((prev) => ({ ...prev, query: value }))
                        if (errors.query) setErrors((p) => ({ ...p, query: false }))
                      }}
                      placeholder="例如：露营、口红、穿搭..."
                      style={inputStyle('query')}
                    />
                    {errors.query && <div style={{ fontSize: 12, color: 'var(--error-500)', marginTop: 4 }}>请输入搜索关键词</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                        采集数量
                      </label>
                      <Input value={String(taskForm.requireNum)} onChange={(value: string) => setTaskForm((prev) => ({ ...prev, requireNum: Number(value) || 1 }))} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                        排序方式
                      </label>
                      <Select
                        value={String(taskForm.sortTypeChoice)}
                        optionList={[
                          { label: '综合排序', value: '0' },
                          { label: '最新发布', value: '1' },
                          { label: '点赞最多', value: '2' },
                          { label: '评论最多', value: '3' },
                          { label: '收藏最多', value: '4' },
                        ]}
                        onChange={(value) => setTaskForm((prev) => ({ ...prev, sortTypeChoice: Number(value) }))}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                        时间范围
                      </label>
                      <Select
                        value={String(taskForm.noteTime)}
                        optionList={[
                          { label: '不限时间', value: '0' },
                          { label: '一天内', value: '1' },
                          { label: '一周内', value: '2' },
                          { label: '半年内', value: '3' },
                        ]}
                        onChange={(value) => setTaskForm((prev) => ({ ...prev, noteTime: Number(value) }))}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div onClick={() => setShowAdvanced(!showAdvanced)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500 }}>
                <span>高级参数</span>
                {showAdvanced ? <IconChevronUp size="small" /> : <IconChevronDown size="small" />}
              </div>

              {showAdvanced && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                      笔记类型
                    </label>
                    <Select
                      value={String(taskForm.noteType)}
                      optionList={[
                        { label: '全部', value: '0' },
                        { label: '图文', value: '1' },
                        { label: '视频', value: '2' },
                      ]}
                      onChange={(value) => setTaskForm((prev) => ({ ...prev, noteType: Number(value) }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                      搜索范围
                    </label>
                    <Select
                      value={String(taskForm.noteRange)}
                      optionList={[
                        { label: '不限', value: '0' },
                        { label: '最近一天', value: '1' },
                        { label: '最近一周', value: '2' },
                        { label: '最近半年', value: '3' },
                      ]}
                      onChange={(value) => setTaskForm((prev) => ({ ...prev, noteRange: Number(value) }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                      位置距离
                    </label>
                    <Select
                      value={String(taskForm.posDistance)}
                      optionList={[
                        { label: '不限', value: '0' },
                        { label: '同城', value: '1' },
                        { label: '附近', value: '2' },
                      ]}
                      onChange={(value) => setTaskForm((prev) => ({ ...prev, posDistance: Number(value) }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: '1px solid var(--color-border)', marginTop: 4, flexWrap: 'wrap' }}>
                <Button type="primary" icon={<IconSearch />} loading={saving} onClick={handleStartTask} size="large" theme="solid">
                  开始采集
                </Button>
                <Button
                  type="tertiary"
                  onClick={() => {
                    setTaskForm((prev) => ({ ...prev, url: '', query: '' }))
                    setErrors({})
                  }}
                >
                  重置输入
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>任务模板</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                可保存当前表单，也可以重命名或删除自定义模板
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={templateName}
                onChange={(value: string) => setTemplateName(value)}
                placeholder={defaultTemplateName}
                style={{ flex: 1 }}
              />
              <Button size="small" type="tertiary" icon={<IconArrowRight />} onClick={handleSaveTemplate}>
                {editingTemplateId ? '保存修改' : '保存当前'}
              </Button>
              {editingTemplateId && (
                <Button
                  size="small"
                  type="tertiary"
                  onClick={() => {
                    setEditingTemplateId(null)
                    setTemplateName(defaultTemplateName)
                  }}
                >
                  取消编辑
                </Button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflow: 'auto' }}>
            {supportedTemplates.map((template) => {
              const mode = resolveTemplateMode(template.action)
              if (!mode) return null

              return (
                <div
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      applyTemplate(template)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{ width: '100%', border: '1px solid var(--color-border)', background: 'var(--color-surface)', borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{template.name}</div>
                        <Tag size="small" color={template.builtin ? 'blue' : 'green'}>
                          {template.builtin ? '内置' : '自定义'}
                        </Tag>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                        {template.description || '任务模板'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {!template.builtin && (
                        <Button
                          size="small"
                          type="tertiary"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditTemplate(template)
                          }}
                        >
                          重命名
                        </Button>
                      )}
                      {!template.builtin && (
                        <Button
                          size="small"
                          type="tertiary"
                          style={{ color: 'var(--error-600)', borderColor: 'var(--error-200)' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTemplate(template)
                          }}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, background: 'var(--primary-50)', color: 'var(--primary-700)' }}>
                      {getActionLabel(template.action)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      {mode === 'video' ? '仅视频结果' : mode === 'search' ? '关键词采集' : '链接采集'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>当前模式</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 10, background: 'var(--primary-50)', border: '1px solid var(--primary-200)' }}>
            <div style={{ fontSize: 36 }}>{activeCard?.icon}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{activeCard?.title}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{activeCard?.desc}</div>
            </div>
          </div>
        </div>

        {(taskForm.url || taskForm.query) && (
          <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', padding: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>参数摘要</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {taskForm.url && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>链接：</span>
                  <span style={{ color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{taskForm.url}</span>
                </div>
              )}
              {taskForm.query && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>关键词：</span>
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{taskForm.query}</span>
                </div>
              )}
              {(taskForm.mode === 'search' || taskForm.mode === 'video') && (
                <>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>数量：</span>
                    <span>{taskForm.requireNum}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>排序：</span>
                    <span>{['综合排序', '最新发布', '点赞最多', '评论最多', '收藏最多'][taskForm.sortTypeChoice] || '综合排序'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ background: activeAccount ? 'var(--success-50)' : 'var(--warning-50)', borderRadius: 12, border: `1px solid ${activeAccount ? 'var(--success-200)' : 'var(--warning-200)'}`, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: activeAccount ? 'var(--success-500)' : 'var(--warning-500)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {activeAccount ? '账号已就绪' : '未设置账号'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            {activeAccount
              ? `当前使用账号：${activeAccount.name}，Cookie 已配置。`
              : '请先在设置中添加小红书账号 Cookie，否则无法采集数据。'}
          </div>
          {!activeAccount && (
            <Button type="primary" size="small" style={{ marginTop: 12 }} onClick={() => setActivePage('settings')}>
              去设置账号
            </Button>
          )}
        </div>

        <div style={{ background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>使用提示</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { num: 1, title: '选择模式', desc: '根据采集目标选择对应模式' },
              { num: 2, title: '填写信息', desc: '输入链接或关键词并补充参数' },
              { num: 3, title: '开始采集', desc: '任务会在后台运行，完成后可在任务页查看详情' },
            ].map((tip) => (
              <div key={tip.num} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary-100)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  {tip.num}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 1 }}>{tip.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>{tip.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
