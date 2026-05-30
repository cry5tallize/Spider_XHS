import { useState } from 'react'
import { Button, Checkbox, Input, Switch, Tag, TextArea, Toast } from '@douyinfe/semi-ui'
import { IconBulb, IconDelete, IconMoonStroked, IconSunStroked, IconPlus } from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'
import { FormField, Card, showConfirm } from '../../components/ui'
import styles from './Settings.module.css'

type SettingsTab = 'accounts' | 'appearance' | 'storage' | 'proxy'

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'accounts', label: '账号管理' },
  { key: 'appearance', label: '外观' },
  { key: 'storage', label: '存储' },
  { key: 'proxy', label: '代理' },
]

const THEME_OPTIONS = [
  { value: 'system' as const, label: '跟随系统', desc: '浅色 / 深色自动跟随操作系统', icon: <IconBulb /> },
  { value: 'light' as const, label: '浅色模式', desc: '明亮清爽，适合白天使用', icon: <IconSunStroked /> },
  { value: 'dark' as const, label: '深色模式', desc: '更柔和的低亮度界面', icon: <IconMoonStroked /> },
]

const EMPTY_ACCOUNT = {
  id: '',
  name: '',
  remark: '',
  cookiesStr: '',
  defaultDownloadDir: '',
  defaultExportDir: '',
  isDefault: false,
}

export default function SettingsPage() {
  const {
    settings,
    accountForm, setAccountForm,
    proxyForm, setProxyForm,
    pathsForm, setPathsForm,
    themePreference, setThemePreference,
    saving, setSaving,
    refreshAll,
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<SettingsTab>('accounts')

  if (!settings) return null

  const activeAccount = settings.accounts.find((item) => item.id === settings.activeAccountId)

  const handleSaveAccount = async () => {
    setSaving(true)
    try {
      await window.desktopAPI.settings.upsertAccount(accountForm)
      await refreshAll()
      Toast.success('账号已保存')
    } catch (error) { Toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`) }
    finally { setSaving(false) }
  }

  const handleSaveProxyPaths = async () => {
    setSaving(true)
    try {
      await window.desktopAPI.settings.update({ proxy: proxyForm, ...pathsForm })
      await refreshAll()
      Toast.success('设置已保存')
    } catch (error) { Toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`) }
    finally { setSaving(false) }
  }

  const handlePickDirectory = async (field: 'defaultDownloadDir' | 'defaultExportDir') => {
    const dir = await window.desktopAPI.settings.pickDirectory()
    if (!dir) return
    const next = { ...pathsForm, [field]: dir }
    setPathsForm(next)
    await window.desktopAPI.settings.update(next)
    await refreshAll()
    Toast.success('路径已保存')
  }

  const handleRemoveAccount = (accountId: string) => {
    const account = settings.accounts.find((item) => item.id === accountId)
    if (!account) return
    showConfirm({
      title: '删除账号', content: `确定删除「${account.name || '未命名'}」吗？`, danger: true, okText: '删除',
      onOk: async () => {
        setSaving(true)
        try {
          await window.desktopAPI.settings.removeAccount(accountId)
          await refreshAll()
          const nextSettings = await window.desktopAPI.settings.get()
          const nextAccount = nextSettings.accounts[0]
          if (nextAccount) setAccountForm({ ...nextAccount })
          else setAccountForm(EMPTY_ACCOUNT)
          Toast.success('已删除')
        } catch (error) { Toast.error(`删除失败`); throw error }
        finally { setSaving(false) }
      },
    })
  }

  const handleThemeChange = (value: typeof themePreference) => {
    setThemePreference(value)
  }

  const addNewAccount = () => {
    setAccountForm({ ...EMPTY_ACCOUNT, id: '' })
  }

  return (
    <div className={styles.root}>
      {/* Tab navigation */}
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Accounts */}
      {activeTab === 'accounts' && (
        <div className={styles.panel}>
          {activeAccount && (
            <div className={styles.currentBanner}>
              <div className={styles.currentBannerInfo}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 14 }}>
                  {(activeAccount.name || 'A').slice(0, 1)}
                </div>
                <div>
                  <div className={styles.currentBannerName}>{activeAccount.name || '未命名账号'}</div>
                  <div className={styles.currentBannerRemark}>{activeAccount.remark || '当前正在使用的账号'}</div>
                </div>
              </div>
              <Tag color="green" size="small">当前</Tag>
            </div>
          )}

          <div className={styles.accountsGrid}>
            {/* Account list */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                所有账号 ({settings.accounts.length})
              </div>
              <div className={styles.accountList}>
                {settings.accounts.map((account) => (
                  <div
                    key={account.id}
                    className={`${styles.accountItem} ${account.id === accountForm.id ? styles.accountItemActive : ''}`}
                    onClick={() => setAccountForm({ ...account })}
                  >
                    <div className={styles.accountItemInfo}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: account.id === settings.activeAccountId ? 'linear-gradient(135deg, var(--primary-500), var(--primary-600))' : 'var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: account.id === settings.activeAccountId ? '#fff' : 'var(--gray-600)', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                        {(account.name || 'A').slice(0, 1)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.accountItemName}>{account.name || '未命名'}</div>
                        <div className={styles.accountItemRemark}>{account.remark || '无备注'}</div>
                      </div>
                    </div>
                    <Button size="small" type="tertiary" icon={<IconDelete />} onClick={(e) => { e.stopPropagation(); handleRemoveAccount(account.id) }} style={{ color: 'var(--error-600)', borderColor: 'var(--error-200)', flexShrink: 0 }} />
                  </div>
                ))}
                <button type="button" className={styles.addAccountBtn} onClick={addNewAccount}>
                  <IconPlus style={{ marginRight: 4 }} />
                  添加账号
                </button>
              </div>
            </div>

            {/* Edit form */}
            <div>
              <div className={styles.sectionHeader}>编辑账号</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className={styles.formGrid2}>
                  <FormField label="账号名称">
                    <Input value={accountForm.name} onChange={(v: string) => setAccountForm((prev) => ({ ...prev, name: v }))} placeholder="输入账号名称" />
                  </FormField>
                  <FormField label="备注">
                    <Input value={accountForm.remark} onChange={(v: string) => setAccountForm((prev) => ({ ...prev, remark: v }))} placeholder="输入备注" />
                  </FormField>
                </div>
                <FormField label="Cookie">
                  <TextArea value={accountForm.cookiesStr} onChange={(v: string) => setAccountForm((prev) => ({ ...prev, cookiesStr: v }))} autosize={{ minRows: 4, maxRows: 6 }} placeholder="粘贴登录 Cookie" />
                </FormField>
                <div className={styles.switchRow}>
                  <span style={{ fontSize: 14 }}>设为默认账号</span>
                  <Switch checked={accountForm.isDefault ?? false} onChange={(checked: boolean) => setAccountForm((prev) => ({ ...prev, isDefault: checked }))} />
                </div>
                <Button type="primary" loading={saving} onClick={handleSaveAccount}>保存账号</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Appearance */}
      {activeTab === 'appearance' && (
        <div className={styles.panel}>
          <Card header="主题设置">
            <div className={styles.themeGrid}>
              {THEME_OPTIONS.map((option) => {
                const selected = themePreference === option.value
                return (
                  <div
                    key={option.value}
                    className={`${styles.themeCard} ${selected ? styles.themeCardSelected : ''}`}
                    onClick={() => handleThemeChange(option.value)}
                  >
                    <div className={styles.themeCardIcon} style={{ background: selected ? 'var(--primary-100)' : 'var(--gray-100)', color: selected ? 'var(--primary-700)' : 'var(--color-text-tertiary)' }}>
                      {option.icon}
                    </div>
                    <div className={styles.themeCardLabel}>{option.label}</div>
                    <div className={styles.themeCardDesc}>{option.desc}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              选择后立即生效。
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Storage */}
      {activeTab === 'storage' && (
        <div className={styles.panel}>
          <Card header="存储设置">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FormField label="默认下载目录">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input value={pathsForm.defaultDownloadDir} onChange={(v: string) => setPathsForm((prev) => ({ ...prev, defaultDownloadDir: v }))} placeholder="选择下载目录" style={{ flex: 1 }} />
                  <Button onClick={() => handlePickDirectory('defaultDownloadDir')}>浏览</Button>
                </div>
              </FormField>
              <FormField label="默认导出目录">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input value={pathsForm.defaultExportDir} onChange={(v: string) => setPathsForm((prev) => ({ ...prev, defaultExportDir: v }))} placeholder="选择导出目录" style={{ flex: 1 }} />
                  <Button onClick={() => handlePickDirectory('defaultExportDir')}>浏览</Button>
                </div>
              </FormField>
              <Button type="primary" loading={saving} onClick={handleSaveProxyPaths}>保存设置</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Proxy */}
      {activeTab === 'proxy' && (
        <div className={styles.panel}>
          <Card header="代理设置">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.switchRow}>
                <span style={{ fontSize: 14 }}>启用代理</span>
                <Switch checked={proxyForm.enabled} onChange={(checked: boolean) => setProxyForm((prev) => ({ ...prev, enabled: checked }))} />
              </div>
              {proxyForm.enabled && (
                <div className={styles.formGrid2}>
                  <FormField label="代理地址">
                    <Input value={proxyForm.server} onChange={(v: string) => setProxyForm((prev) => ({ ...prev, server: v }))} placeholder="127.0.0.1:7890" />
                  </FormField>
                  <FormField label="绕过列表">
                    <Input value={proxyForm.bypass} onChange={(v: string) => setProxyForm((prev) => ({ ...prev, bypass: v }))} placeholder="localhost,127.0.0.1" />
                  </FormField>
                  <FormField label="用户名">
                    <Input value={proxyForm.username} onChange={(v: string) => setProxyForm((prev) => ({ ...prev, username: v }))} />
                  </FormField>
                  <FormField label="密码">
                    <Input value={proxyForm.password} onChange={(v: string) => setProxyForm((prev) => ({ ...prev, password: v }))} type="password" />
                  </FormField>
                </div>
              )}
              <Button type="primary" loading={saving} onClick={handleSaveProxyPaths}>保存设置</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
