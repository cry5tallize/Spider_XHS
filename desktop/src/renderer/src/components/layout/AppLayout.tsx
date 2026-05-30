import { Spin } from '@douyinfe/semi-ui'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAppStore } from '../../stores/appStore'
import type { PageKey } from '../../types'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const {
    activePage,
    setActivePage,
    loading,
    settings,
    tasks,
    sidebarCollapsed,
    toggleSidebar,
    notifications,
    clearNotifications,
    setActivePage: navigateToPage,
    setSelectedTaskId,
  } = useAppStore()

  const activeAccount = settings?.accounts.find(
    (account) => account.id === settings.activeAccountId
  ) ?? null

  const runningTaskCount = tasks.filter((t) => t.status === 'running').length
  const failedTaskCount = tasks.filter((t) => t.status === 'failed').length

  const handleNavigateToTask = (_page: PageKey, taskId: string) => {
    setSelectedTaskId(taskId)
    navigateToPage('tasks')
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Spin size="large" />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        activeAccount={activeAccount}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        runningTaskCount={runningTaskCount}
        failedTaskCount={failedTaskCount}
      />

      <div className="app-main">
        <Header
          activePage={activePage}
          accountCount={settings?.accounts.length ?? 0}
          taskCount={tasks.length}
          notifications={notifications}
          onClearNotifications={clearNotifications}
          onNavigateToTask={handleNavigateToTask}
        />

        <div className="app-content">
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
