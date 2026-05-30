import { create } from 'zustand'
import type { PageKey, TaskFormState, CaptureMode } from '../types'
import { getDefaultForm } from '../types'

type AccountForm = Partial<DesktopAccountSettings> & { id: string }
type PathsForm = { defaultDownloadDir: string; defaultExportDir: string }
export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppNotification {
  id: string
  taskId: string
  taskName: string
  status: 'success' | 'failed'
  timestamp: string
}

type TaskSortField = 'createdAt' | 'updatedAt' | 'name' | 'status'
type TaskSortDir = 'asc' | 'desc'

const THEME_STORAGE_KEY = 'spider-xhs-theme-preference'

function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function writeThemePreference(value: ThemePreference) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_STORAGE_KEY, value)
}

interface AppStore {
  // Navigation
  activePage: PageKey
  setActivePage: (page: PageKey) => void

  // Loading states
  loading: boolean
  setLoading: (loading: boolean) => void
  saving: boolean
  setSaving: (saving: boolean) => void

  // Data
  settings: DesktopAppSettings | null
  setSettings: (settings: DesktopAppSettings | null) => void
  tasks: DesktopTaskRun[]
  setTasks: (tasks: DesktopTaskRun[]) => void
  templates: DesktopTaskTemplate[]
  setTemplates: (templates: DesktopTaskTemplate[]) => void

  // Active account (computed from settings)
  activeAccount: DesktopAccountSettings | null

  // Task form
  taskForm: TaskFormState
  setTaskForm: (form: TaskFormState | ((prev: TaskFormState) => TaskFormState)) => void
  resetTaskForm: (mode?: CaptureMode) => void

  // Account form
  accountForm: AccountForm
  setAccountForm: (form: AccountForm | ((prev: AccountForm) => AccountForm)) => void

  // Proxy form
  proxyForm: DesktopProxySettings
  setProxyForm: (form: DesktopProxySettings | ((prev: DesktopProxySettings) => DesktopProxySettings)) => void

  // Paths form
  pathsForm: PathsForm
  setPathsForm: (form: PathsForm | ((prev: PathsForm) => PathsForm)) => void

  // Theme
  themePreference: ThemePreference
  setThemePreference: (themePreference: ThemePreference) => void

  // Selected task
  selectedTaskId: string | null
  setSelectedTaskId: (id: string | null) => void

  // Task filter
  taskFilter: 'all' | 'video' | 'normal'
  setTaskFilter: (filter: 'all' | 'video' | 'normal') => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Notifications
  notifications: AppNotification[]
  addNotification: (notification: AppNotification) => void
  clearNotifications: () => void

  // Task search
  taskSearchQuery: string
  setTaskSearchQuery: (query: string) => void

  // Task sort
  taskSortField: TaskSortField
  taskSortDir: TaskSortDir
  setTaskSort: (field: TaskSortField, dir: TaskSortDir) => void

  // Task multi-select
  selectedTaskIds: string[]
  toggleTaskSelection: (taskId: string) => void
  selectAllTasks: (taskIds: string[]) => void
  clearTaskSelection: () => void

  // Refresh data
  refreshAll: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Navigation
  activePage: 'dashboard',
  setActivePage: (page) => set({ activePage: page }),

  // Loading states
  loading: true,
  setLoading: (loading) => set({ loading }),
  saving: false,
  setSaving: (saving) => set({ saving }),

  // Data
  settings: null,
  setSettings: (settings) => set({ 
    settings,
    activeAccount: settings?.accounts.find((a) => a.id === settings.activeAccountId) ?? null
  }),
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  templates: [],
  setTemplates: (templates) => set({ templates }),

  // Active account
  activeAccount: null,

  // Task form
  taskForm: getDefaultForm(),
  setTaskForm: (form) => {
    if (typeof form === 'function') {
      set((state) => ({ taskForm: form(state.taskForm) }))
    } else {
      set({ taskForm: form })
    }
  },
  resetTaskForm: (mode) => set({ taskForm: getDefaultForm(mode) }),

  // Account form
  accountForm: {
    id: '',
    name: '',
    remark: '',
    cookiesStr: '',
    defaultDownloadDir: '',
    defaultExportDir: '',
    isDefault: false,
  },
  setAccountForm: (form) => {
    if (typeof form === 'function') {
      set((state) => ({ accountForm: form(state.accountForm) }))
    } else {
      set({ accountForm: form })
    }
  },

  // Proxy form
  proxyForm: {
    enabled: false,
    server: '',
    bypass: '',
    username: '',
    password: '',
  },
  setProxyForm: (form) => {
    if (typeof form === 'function') {
      set((state) => ({ proxyForm: form(state.proxyForm) }))
    } else {
      set({ proxyForm: form })
    }
  },

  // Paths form
  pathsForm: {
    defaultDownloadDir: '',
    defaultExportDir: '',
  },
  setPathsForm: (form) => {
    if (typeof form === 'function') {
      set((state) => ({ pathsForm: form(state.pathsForm) }))
    } else {
      set({ pathsForm: form })
    }
  },

  // Theme
  themePreference: readThemePreference(),
  setThemePreference: (themePreference) => {
    writeThemePreference(themePreference)
    set({ themePreference })
  },

  // Selected task
  selectedTaskId: '',
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  // Task filter
  taskFilter: 'all',
  setTaskFilter: (filter) => set({ taskFilter: filter }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Notifications
  notifications: [],
  addNotification: (notification) => set((s) => ({ notifications: [notification, ...s.notifications].slice(0, 30) })),
  clearNotifications: () => set({ notifications: [] }),

  // Task search
  taskSearchQuery: '',
  setTaskSearchQuery: (query) => set({ taskSearchQuery: query }),

  // Task sort
  taskSortField: 'createdAt' as TaskSortField,
  taskSortDir: 'desc' as TaskSortDir,
  setTaskSort: (field, dir) => set({ taskSortField: field, taskSortDir: dir }),

  // Task multi-select
  selectedTaskIds: [],
  toggleTaskSelection: (taskId) => set((s) => ({
    selectedTaskIds: s.selectedTaskIds.includes(taskId)
      ? s.selectedTaskIds.filter((id) => id !== taskId)
      : [...s.selectedTaskIds, taskId],
  })),
  selectAllTasks: (taskIds) => set({ selectedTaskIds: taskIds }),
  clearTaskSelection: () => set({ selectedTaskIds: [] }),

  // Refresh data
  refreshAll: async () => {
    const [nextSettings, nextTasks, nextTemplates] = await Promise.all([
      window.desktopAPI.settings.get(),
      window.desktopAPI.tasks.list(),
      window.desktopAPI.tasks.listTemplates(),
    ])
    set({
      settings: nextSettings,
      tasks: nextTasks,
      templates: nextTemplates,
      activeAccount: nextSettings.accounts.find((a) => a.id === nextSettings.activeAccountId) ?? null,
      proxyForm: nextSettings.proxy,
      pathsForm: {
        defaultDownloadDir: nextSettings.defaultDownloadDir,
        defaultExportDir: nextSettings.defaultExportDir,
      },
    })
  },
}))
