import { Spin } from '@douyinfe/semi-ui'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAppStore } from '../../stores/appStore'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { activePage, setActivePage, loading, settings, tasks } = useAppStore()

  const activeAccount = settings?.accounts.find(
    (account) => account.id === settings.activeAccountId
  ) ?? null

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
      />
      
      <div className="app-main">
        <Header 
          activePage={activePage}
          accountCount={settings?.accounts.length ?? 0}
          taskCount={tasks.length}
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
