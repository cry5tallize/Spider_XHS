export type PageKey = 'dashboard' | 'newTask' | 'noteWorkbench' | 'tasks' | 'settings'

export type CaptureMode = 'note' | 'user' | 'search' | 'video'

export interface TaskFormState {
  mode: CaptureMode
  title: string
  url: string
  query: string
  requireNum: number
  sortTypeChoice: number
  noteType: number
  noteTime: number
  noteRange: number
  posDistance: number
  videoOnly: boolean
}

export interface AppState {
  activePage: PageKey
  setActivePage: (page: PageKey) => void
}

export const TASK_MODE_CARDS: Array<{
  mode: CaptureMode
  title: string
  desc: string
  icon: string
}> = [
  { mode: 'note', title: '笔记详情', desc: '输入单个笔记链接，获取详情、图片、视频和评论', icon: '📑' },
  { mode: 'user', title: '用户采集', desc: '输入用户主页，获取用户信息和全部作品', icon: '👥' },
  { mode: 'search', title: '关键词搜索', desc: '按关键词批量采集笔记，支持数量和排序', icon: '🔎' },
  { mode: 'video', title: '视频优先', desc: '只看视频笔记，适合做视频内容抓取', icon: '🎞️' },
]

export const MODE_TO_ACTION: Record<CaptureMode, DesktopTaskAction> = {
  note: 'note-info',
  user: 'user-all-notes',
  search: 'search-note',
  video: 'video-search-note',
}

export function getActionLabel(action: DesktopTaskAction | string): string {
  switch (action) {
    case 'note-info': return '笔记详情'
    case 'video-note-info': return '视频笔记详情'
    case 'user-info': return '用户信息'
    case 'user-all-notes': return '用户全部笔记'
    case 'search-keyword': return '搜索关键词'
    case 'search-note': return '搜索笔记'
    case 'video-search-note': return '视频搜索'
    case 'search-user': return '搜索用户'
    case 'note-comments': return '笔记评论'
    case 'unread-message': return '未读消息'
    case 'mentions': return '评论和提醒'
    case 'mentions-all': return '全部提醒'
    case 'likes': return '点赞和收藏'
    case 'likes-all': return '全部点赞和收藏'
    case 'connections': return '新增加关注'
    case 'connections-all': return '全部新增加关注'
    case 'note-no-water-video': return '无水印视频'
    case 'note-no-water-img': return '无水印图片'
    case 'note-batch': return '笔记批量解析'
    default: return action
  }
}

export function getDefaultForm(mode: CaptureMode = 'note'): TaskFormState {
  return {
    mode,
    title: mode === 'note' ? '笔记采集' : mode === 'user' ? '用户采集' : mode === 'search' ? '搜索采集' : '视频采集',
    url: '',
    query: '',
    requireNum: 10,
    sortTypeChoice: 0,
    noteType: 0,
    noteTime: 0,
    noteRange: 0,
    posDistance: 0,
    videoOnly: mode === 'video',
  }
}

export function getCaptureLabel(mode: CaptureMode): string {
  switch (mode) {
    case 'note': return '笔记'
    case 'user': return '用户'
    case 'search': return '搜索'
    case 'video': return '视频'
  }
}

export function getStatusTag(status: string): { text: string; type: 'success' | 'error' | 'processing' | 'default' } {
  switch (status) {
    case 'success': return { text: '已完成', type: 'success' }
    case 'failed': return { text: '失败', type: 'error' }
    case 'running': return { text: '运行中', type: 'processing' }
    default: return { text: '待执行', type: 'default' }
  }
}

export function isVideoTask(task: DesktopTaskRun): boolean {
  const normalized = task.normalizedResult as Record<string, unknown> | null
  const noteType = normalized && typeof normalized.noteType === 'string' ? normalized.noteType : ''
  const noteList = normalized && Array.isArray(normalized.noteList) ? normalized.noteList : []

  return task.action === 'video-note-info'
    || task.action === 'video-search-note'
    || noteType === '视频'
    || (noteList.length > 0 && noteList.every((item) => (item as { noteType?: string }).noteType === '视频'))
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了，注意休息'
  if (hour < 9) return '早上好，准备开始采集了吗'
  if (hour < 12) return '上午好，今天想采集什么'
  if (hour < 14) return '中午好，休息一下再继续'
  if (hour < 18) return '下午好，继续你的采集之旅'
  return '晚上好，今天收获如何'
}
