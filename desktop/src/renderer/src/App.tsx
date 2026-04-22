import { useEffect } from 'react'
import { Toast } from '@douyinfe/semi-ui'
import { AppLayout } from './components/layout/AppLayout'
import { useAppStore } from './stores/appStore'
import DashboardPage from './pages/Dashboard'
import NewTaskPage from './pages/NewTask'
import NoteWorkbenchPage from './pages/NoteWorkbench'
import TasksPage from './pages/Tasks'
import SettingsPage from './pages/Settings'
import './styles/global.css'

export default function App() {
  const { activePage, setActivePage, setLoading, refreshAll, setAccountForm, themePreference } = useAppStore()

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const [nextSettings, nextTasks, nextTemplates] = await Promise.all([
          window.desktopAPI.settings.get(),
          window.desktopAPI.tasks.list(),
          window.desktopAPI.tasks.listTemplates(),
        ])

        if (!mounted) return

        const store = useAppStore.getState()
        store.setSettings(nextSettings)
        store.setTasks(nextTasks)
        store.setTemplates(nextTemplates)
        store.setProxyForm(nextSettings.proxy)
        store.setPathsForm({
          defaultDownloadDir: nextSettings.defaultDownloadDir,
          defaultExportDir: nextSettings.defaultExportDir,
        })

        const active = nextSettings.accounts.find(
          (item) => item.id === nextSettings.activeAccountId
        ) ?? nextSettings.accounts[0]
        if (active) {
          setAccountForm({ ...active })
        }

        const firstTask = nextTasks[0]
        if (firstTask) {
          store.setSelectedTaskId(firstTask.id)
        }
      } catch (error) {
        Toast.error(`加载失败: ${error instanceof Error ? error.message : '未知错误'}`)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [setLoading, refreshAll, setAccountForm])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const isDark = themePreference === 'dark' || (themePreference === 'system' && media.matches)
      if (isDark) {
        document.body.setAttribute('theme-mode', 'dark')
      } else {
        document.body.removeAttribute('theme-mode')
      }
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    }

    applyTheme()

    if (themePreference !== 'system') return undefined

    const handleChange = () => {
      applyTheme()
    }

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [themePreference])

  return (
    <AppLayout>
      {activePage === 'dashboard' && <DashboardPage />}
      {activePage === 'newTask' && <NewTaskPage />}
      {activePage === 'noteWorkbench' && <NoteWorkbenchPage />}
      {activePage === 'tasks' && <TasksPage />}
      {activePage === 'settings' && <SettingsPage />}
    </AppLayout>
  )
}
