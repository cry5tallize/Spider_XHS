import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getProjectDataPath } from './data-path'
import { buildFallbackArchive, standardizeComment, standardizeNote, standardizeSearchNotes, standardizeSearchUsers, standardizeUser } from './data-standardizer'
import type { AppSettings } from './settings-store'
import { exportTaskRun } from './export-manager'

export type TaskAction =
  | 'note-info'
  | 'video-note-info'
  | 'user-info'
  | 'user-all-notes'
  | 'search-keyword'
  | 'search-note'
  | 'video-search-note'
  | 'search-user'
  | 'note-comments'
  | 'unread-message'
  | 'mentions'
  | 'mentions-all'
  | 'likes'
  | 'likes-all'
  | 'connections'
  | 'connections-all'
  | 'note-no-water-video'
  | 'note-no-water-img'
  | 'note-batch'

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
export type TaskStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'

export type TaskStep = {
  id: string
  title: string
  status: TaskStepStatus
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  error: string
  startedAt: string
  endedAt: string
}

export type TaskTemplate = {
  id: string
  name: string
  action: TaskAction
  description: string
  defaultParams: Record<string, unknown>
  createdAt: string
  updatedAt: string
  builtin?: boolean
}

export type TaskRun = {
  id: string
  templateId: string
  name: string
  action: TaskAction
  status: TaskStatus
  progress: number
  params: Record<string, unknown>
  result: Record<string, unknown> | null
  rawResult: Record<string, unknown> | null
  normalizedResult: Record<string, unknown> | null
  steps: TaskStep[]
  retryCount: number
  createdAt: string
  updatedAt: string
  startedAt: string
  endedAt: string
  cancelledAt: string
}

export type TaskState = {
  templates: TaskTemplate[]
  tasks: TaskRun[]
}

const DEFAULT_STATE: TaskState = {
  templates: [],
  tasks: [],
}

const BUILT_IN_TEMPLATES: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '笔记详情',
    action: 'note-info',
    description: '获取单篇笔记详情并标准化',
    defaultParams: { url: '' },
  },
  {
    name: '视频笔记详情',
    action: 'video-note-info',
    description: '获取单篇视频笔记详情并标准化',
    defaultParams: { url: '' },
  },
  {
    name: '用户信息',
    action: 'user-info',
    description: '获取单个用户信息并标准化',
    defaultParams: { userId: '' },
  },
  {
    name: '用户全部笔记',
    action: 'user-all-notes',
    description: '获取用户全部笔记并返回原始数据',
    defaultParams: { userUrl: '' },
  },
  {
    name: '搜索关键词',
    action: 'search-keyword',
    description: '获取关键词推荐词',
    defaultParams: { word: '' },
  },
  {
    name: '搜索笔记',
    action: 'search-note',
    description: '按关键词搜索笔记并标准化',
    defaultParams: { query: '', page: 1, sortTypeChoice: 0, noteType: 0, noteTime: 0, noteRange: 0, posDistance: 0, geo: '' },
  },
  {
    name: '视频笔记搜索',
    action: 'video-search-note',
    description: '按关键词搜索视频笔记并标准化',
    defaultParams: { query: '', page: 1, sortTypeChoice: 0, noteTime: 0, noteRange: 0, posDistance: 0, geo: '' },
  },
  {
    name: '搜索用户',
    action: 'search-user',
    description: '按关键词搜索用户并标准化',
    defaultParams: { query: '', page: 1 },
  },
  {
    name: '笔记评论',
    action: 'note-comments',
    description: '获取单篇笔记全部评论',
    defaultParams: { url: '' },
  },
  {
    name: '未读消息',
    action: 'unread-message',
    description: '获取未读消息计数',
    defaultParams: {},
  },
  {
    name: '评论和提醒',
    action: 'mentions-all',
    description: '获取全部 @ 提醒',
    defaultParams: {},
  },
  {
    name: '点赞和收藏',
    action: 'likes-all',
    description: '获取全部点赞和收藏消息',
    defaultParams: {},
  },
  {
    name: '新增关注',
    action: 'connections-all',
    description: '获取全部新增关注',
    defaultParams: {},
  },
  {
    name: '无水印视频',
    action: 'note-no-water-video',
    description: '解析笔记视频无水印地址',
    defaultParams: { noteId: '' },
  },
  {
    name: '无水印图片',
    action: 'note-no-water-img',
    description: '解析图片无水印地址',
    defaultParams: { imgUrl: '' },
  },
]

function getStatePath() {
  return getProjectDataPath('tasks.json')
}

function ensureStateDir() {
  mkdirSync(dirname(getStatePath()), { recursive: true })
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function now() {
  return new Date().toISOString()
}

function isSameParams(left: Record<string, unknown> | undefined, right: Record<string, unknown>) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {})
}

function isBuiltInTemplate(template: Partial<TaskTemplate>) {
  if (template.builtin) return true
  return BUILT_IN_TEMPLATES.some((item) =>
    item.action === template.action
      && item.name === template.name
      && isSameParams(template.defaultParams as Record<string, unknown> | undefined, item.defaultParams),
  )
}

function normalizeTemplate(template: TaskTemplate): TaskTemplate {
  return {
    ...template,
    builtin: isBuiltInTemplate(template),
  }
}

function normalizeState(state: Partial<TaskState> | null | undefined): TaskState {
  const templates = Array.isArray(state?.templates)
    ? state.templates.map((template) => normalizeTemplate(template as TaskTemplate))
    : []
  const tasks = Array.isArray(state?.tasks) ? state.tasks : []

  return {
    templates,
    tasks,
  }
}

function seedBuiltInTemplates(state: TaskState) {
  const createdAt = now()
  const existingActions = new Set(
    state.templates
      .filter((template) => isBuiltInTemplate(template))
      .map((template) => template.action),
  )
  const missingTemplates = BUILT_IN_TEMPLATES.filter((template) => !existingActions.has(template.action)).map((template) => ({
    id: createId('tpl'),
    createdAt,
    updatedAt: createdAt,
    builtin: true,
    ...template,
  }))

  if (state.templates.length === 0) {
    state.templates = missingTemplates
  } else if (missingTemplates.length > 0) {
    state.templates = [...state.templates, ...missingTemplates]
  }
  return state
}

export function loadTaskState(): TaskState {
  try {
    const raw = readFileSync(getStatePath(), 'utf-8')
    const parsed = normalizeState(JSON.parse(raw) as Partial<TaskState>)
    return seedBuiltInTemplates(parsed)
  } catch {
    return seedBuiltInTemplates(normalizeState(DEFAULT_STATE))
  }
}

export function saveTaskState(state: TaskState) {
  ensureStateDir()
  writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8')
}

export function listTemplates() {
  return loadTaskState().templates
}

export function listTasks() {
  return loadTaskState().tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getTask(taskId: string) {
  return loadTaskState().tasks.find((task) => task.id === taskId) ?? null
}

export function upsertTemplate(payload: Partial<TaskTemplate> & { action: TaskAction; name: string }) {
  const state = loadTaskState()
  const templateId = payload.id ?? createId('tpl')
  const existingIndex = state.templates.findIndex((template) => template.id === templateId)
  const existingTemplate = existingIndex >= 0 ? state.templates[existingIndex] : null

  if (existingTemplate && isBuiltInTemplate(existingTemplate)) {
    return existingTemplate
  }

  const template: TaskTemplate = {
    id: templateId,
    name: payload.name,
    action: payload.action,
    description: payload.description ?? '',
    defaultParams: payload.defaultParams ?? {},
    builtin: false,
    createdAt: existingIndex >= 0 ? state.templates[existingIndex].createdAt : now(),
    updatedAt: now(),
  }

  if (existingIndex >= 0) {
    state.templates[existingIndex] = template
  } else {
    state.templates.push(template)
  }

  saveTaskState(state)
  return template
}

export function removeTemplate(templateId: string) {
  const state = loadTaskState()
  const template = state.templates.find((item) => item.id === templateId)
  if (!template || isBuiltInTemplate(template)) {
    return state.templates
  }

  state.templates = state.templates.filter((item) => item.id !== templateId)
  saveTaskState(state)
  return state.templates
}

export function createTask(payload: { templateId?: string; name?: string; action?: TaskAction; params?: Record<string, unknown> }) {
  const state = loadTaskState()
  const template = payload.templateId ? state.templates.find((item) => item.id === payload.templateId) : null
  const action = payload.action ?? template?.action ?? 'note-info'
  const params = {
    ...(template?.defaultParams ?? {}),
    ...(payload.params ?? {}),
  }

  const task: TaskRun = {
    id: createId('task'),
    templateId: template?.id ?? payload.templateId ?? '',
    name: payload.name ?? template?.name ?? '未命名任务',
    action,
    status: 'pending',
    progress: 0,
    params,
    result: null,
    rawResult: null,
    normalizedResult: null,
    steps: [],
    retryCount: 0,
    createdAt: now(),
    updatedAt: now(),
    startedAt: '',
    endedAt: '',
    cancelledAt: '',
  }

  state.tasks.unshift(task)
  saveTaskState(state)
  return task
}

export function patchTask(taskId: string, patch: Partial<TaskRun>) {
  return updateTask(taskId, (current) => ({
    ...current,
    ...patch,
    updatedAt: now(),
  }))
}

export function createNoteBatchTask(payload: { name: string; params: Record<string, unknown> }) {
  return createTask({
    name: payload.name,
    action: 'note-batch',
    params: payload.params,
  })
}

function updateTask(taskId: string, updater: (task: TaskRun) => TaskRun) {
  const state = loadTaskState()
  const index = state.tasks.findIndex((task) => task.id === taskId)
  if (index < 0) {
    return null
  }

  state.tasks[index] = updater(state.tasks[index])
  saveTaskState(state)
  return state.tasks[index]
}

function createStep(title: string, input: Record<string, unknown>): TaskStep {
  return {
    id: createId('step'),
    title,
    status: 'pending',
    input,
    output: null,
    error: '',
    startedAt: '',
    endedAt: '',
  }
}

function markStep(step: TaskStep, status: TaskStepStatus, output: Record<string, unknown> | null = null, error = '') {
  return {
    ...step,
    status,
    output,
    error,
    startedAt: step.startedAt || now(),
    endedAt: now(),
  }
}

function buildRawResult(success: boolean, msg: string, data: unknown, rawText: string, resJson: Record<string, unknown> | null) {
  return { success, msg, data, rawText, resJson }
}

function isVideoNormalizedResult(action: TaskAction, normalized: Record<string, unknown> | null) {
  if (!normalized) {
    return false
  }

  if (action === 'video-note-info') {
    return normalized.noteType === '视频'
  }

  if (action === 'video-search-note') {
    return Array.isArray(normalized.noteList) && normalized.noteList.every((note) => note?.noteType === '视频')
  }

  return false
}

async function executeAction(action: TaskAction, params: Record<string, unknown>, pcApi: any, cookiesStr: string) {
  switch (action) {
    case 'note-info':
    case 'video-note-info':
      return pcApi.getNoteInfo(toString(params.url), cookiesStr)
    case 'user-info':
      return pcApi.getUserInfo(toString(params.userId), cookiesStr)
    case 'user-all-notes':
      return pcApi.getUserAllNotes(toString(params.userUrl), cookiesStr)
    case 'search-keyword':
      return pcApi.getSearchKeyword(toString(params.word), cookiesStr)
    case 'search-note':
      return pcApi.searchNote(
        toString(params.query),
        cookiesStr,
        toNumber(params.page, 1),
        toNumber(params.sortTypeChoice, 0),
        toNumber(params.noteType, 0),
        toNumber(params.noteTime, 0),
        toNumber(params.noteRange, 0),
        toNumber(params.posDistance, 0),
        params.geo ?? '',
      )
    case 'video-search-note':
      return pcApi.searchNote(
        toString(params.query),
        cookiesStr,
        toNumber(params.page, 1),
        toNumber(params.sortTypeChoice, 0),
        1,
        toNumber(params.noteTime, 0),
        toNumber(params.noteRange, 0),
        toNumber(params.posDistance, 0),
        params.geo ?? '',
      )
    case 'search-user':
      return pcApi.searchUser(toString(params.query), cookiesStr, toNumber(params.page, 1))
    case 'note-comments':
      return pcApi.getNoteAllComment(toString(params.url), cookiesStr)
    case 'unread-message':
      return pcApi.getUnreadMessage(cookiesStr)
    case 'mentions':
      return pcApi.getMetions(toString(params.cursor), cookiesStr)
    case 'mentions-all':
      return pcApi.getAllMetions(cookiesStr)
    case 'likes':
      return pcApi.getLikesAndCollects(toString(params.cursor), cookiesStr)
    case 'likes-all':
      return pcApi.getAllLikesAndCollects(cookiesStr)
    case 'connections':
      return pcApi.getNewConnections(toString(params.cursor), cookiesStr)
    case 'connections-all':
      return pcApi.getAllNewConnections(cookiesStr)
    case 'note-no-water-video':
      return pcApi.getNoteNoWaterVideo(toString(params.noteId))
    case 'note-no-water-img':
      return pcApi.getNoteNoWaterImg(toString(params.imgUrl))
    default:
      return buildRawResult(false, `unsupported action: ${action}`, null, '', null)
  }
}

function normalizeTaskResult(action: TaskAction, result: any, pcApi: any) {
  const rawData = result?.data ?? null
  switch (action) {
    case 'note-info':
    case 'video-note-info':
      return pcApi.standardizeNoteInfo(rawData)
    case 'user-info':
      return pcApi.standardizeUserInfo(rawData, '')
    case 'user-all-notes':
      return standardizeSearchNotes(Array.isArray(rawData?.noteList) ? rawData.noteList : [])
    case 'search-note':
      return pcApi.standardizeSearchNoteItems(Array.isArray(rawData?.noteList) ? rawData.noteList : Array.isArray(rawData?.items) ? rawData.items : [])
    case 'video-search-note': {
      const standardized = pcApi.standardizeSearchNoteItems(Array.isArray(rawData?.noteList) ? rawData.noteList : Array.isArray(rawData?.items) ? rawData.items : [])
      const normalized = standardized?.normalized
      if (normalized?.noteList) {
        normalized.noteList = normalized.noteList.filter((note: { noteType?: string }) => note.noteType === '视频')
      }
      return standardized
    }
    case 'search-user':
      return pcApi.standardizeSearchUserItems(Array.isArray(rawData?.userList) ? rawData.userList : Array.isArray(rawData?.users) ? rawData.users : [])
    case 'note-comments':
      return buildFallbackArchive('comment-list', '评论结果未标准化', Array.isArray(rawData) ? rawData.map((item) => standardizeComment(item).normalized).filter(Boolean) : rawData)
    default:
      return buildFallbackArchive(action, result?.msg ?? 'success', rawData)
  }
}

export async function runTask(taskId: string, pcApi: any, cookiesStr: string) {
  const task = getTask(taskId)
  if (!task) {
    return null
  }

  if (task.status === 'running') {
    return task
  }

  let nextTask = updateTask(taskId, (current) => ({
    ...current,
    status: 'running',
    startedAt: current.startedAt || now(),
    updatedAt: now(),
    steps: [createStep('执行采集', current.params)],
  }))

  if (!nextTask) {
    return null
  }

  try {
    const result = await executeAction(task.action, task.params, pcApi, cookiesStr)
    const normalized = normalizeTaskResult(task.action, result, pcApi)
    const videoMismatch = isVideoNormalizedResult(task.action, normalized as Record<string, unknown> | null) === false && (task.action === 'video-note-info' || task.action === 'video-search-note')
    nextTask = updateTask(taskId, (current) => ({
      ...current,
      status: result.success && !videoMismatch ? 'success' : 'failed',
      progress: 100,
      result: result as Record<string, unknown>,
      rawResult: result as Record<string, unknown>,
      normalizedResult: normalized as Record<string, unknown>,
      steps: [markStep(current.steps[0], result.success && !videoMismatch ? 'success' : 'failed', { result }, videoMismatch ? '不是视频笔记' : result.success ? '' : result.msg)],
      updatedAt: now(),
      endedAt: now(),
    }))
    return nextTask
  } catch (error) {
    const msg = error instanceof Error ? error.message : '任务执行失败'
    nextTask = updateTask(taskId, (current) => ({
      ...current,
      status: 'failed',
      progress: 100,
      result: buildRawResult(false, msg, null, '', null),
      rawResult: buildRawResult(false, msg, null, '', null),
      normalizedResult: buildFallbackArchive(task.action, msg, null) as unknown as Record<string, unknown>,
      steps: [markStep(current.steps[0], 'failed', null, msg)],
      updatedAt: now(),
      endedAt: now(),
    }))
    return nextTask
  }
}

export async function retryTask(taskId: string, pcApi: any, cookiesStr: string) {
  const task = getTask(taskId)
  if (!task) {
    return null
  }

  updateTask(taskId, (current) => ({
    ...current,
    retryCount: current.retryCount + 1,
    status: 'pending',
    progress: 0,
    startedAt: '',
    endedAt: '',
    cancelledAt: '',
    steps: [],
    updatedAt: now(),
  }))

  return runTask(taskId, pcApi, cookiesStr)
}

export async function rerunTask(taskId: string, pcApi: any, cookiesStr: string) {
  const task = getTask(taskId)
  if (!task) {
    return null
  }

  const copied = createTask({
    templateId: task.templateId,
    name: `${task.name} - 重跑`,
    action: task.action,
    params: task.params,
  })
  return runTask(copied.id, pcApi, cookiesStr)
}

export function reparseTask(taskId: string, pcApi: any) {
  return updateTask(taskId, (current) => {
    const rawResult = current.rawResult
    if (!rawResult) {
      return current
    }

    const normalized = normalizeTaskResult(current.action, rawResult, pcApi)
    return {
      ...current,
      normalizedResult: normalized as Record<string, unknown>,
      updatedAt: now(),
    }
  })
}

export function cancelTask(taskId: string) {
  return updateTask(taskId, (current) => ({
    ...current,
    status: 'cancelled',
    cancelledAt: now(),
    endedAt: now(),
    updatedAt: now(),
  }))
}

export function removeTask(taskId: string) {
  const state = loadTaskState()
  state.tasks = state.tasks.filter((task) => task.id !== taskId)
  saveTaskState(state)
  return state.tasks
}

export async function exportTask(
  taskId: string,
  settings: AppSettings,
  options?: { videoStreamUrl?: string },
  onProgress?: (progress: unknown) => void,
) {
  const task = getTask(taskId)
  if (!task) {
    return null
  }

  return exportTaskRun(task, settings, options, onProgress as ((progress: never) => void) | undefined)
}

function toString(value: unknown) {
  return value === null || value === undefined ? '' : String(value)
}

function toNumber(value: unknown, fallback: number) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}
