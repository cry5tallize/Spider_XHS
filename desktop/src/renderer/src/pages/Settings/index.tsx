import { Button, Checkbox, Input, Modal, Switch, Tag, TextArea, Toast } from '@douyinfe/semi-ui'
import { IconBulb, IconDelete, IconMoonStroked, IconSunStroked } from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'

const EMPTY_ACCOUNT_FORM = {
  id: '',
  name: '',
  remark: '',
  cookiesStr: '',
  defaultDownloadDir: '',
  defaultExportDir: '',
  isDefault: false,
}

const THEME_OPTIONS = [
  {
    value: 'system' as const,
    label: '跟随系统',
    description: '浅色 / 深色自动跟随操作系统',
    icon: <IconBulb />,
  },
  {
    value: 'light' as const,
    label: '浅色模式',
    description: '明亮清爽，适合白天使用',
    icon: <IconSunStroked />,
  },
  {
    value: 'dark' as const,
    label: '深色模式',
    description: '更柔和的低亮度界面',
    icon: <IconMoonStroked />,
  },
]

export default function SettingsPage() {
  const {
    settings,
    accountForm,
    setAccountForm,
    setSettings,
    proxyForm,
    setProxyForm,
    pathsForm,
    setPathsForm,
    themePreference,
    setThemePreference,
    saving,
    setSaving,
    refreshAll,
  } = useAppStore()

  if (!settings) return null

  const activeAccount = settings.accounts.find((item) => item.id === settings.activeAccountId)

  const handleSaveAccount = async () => {
    setSaving(true)
    try {
      await window.desktopAPI.settings.upsertAccount(accountForm)
      await refreshAll()
      Toast.success('账号已保存')
    } catch (error) {
      Toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await window.desktopAPI.settings.update({
        proxy: proxyForm,
        ...pathsForm,
      })
      await refreshAll()
      Toast.success('设置已保存')
    } catch (error) {
      Toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const handlePickDirectory = async (field: 'defaultDownloadDir' | 'defaultExportDir') => {
    const dir = await window.desktopAPI.settings.pickDirectory()
    if (!dir) return

    const nextPaths = { ...pathsForm, [field]: dir }
    setPathsForm(nextPaths)

    setSaving(true)
    try {
      await window.desktopAPI.settings.update(nextPaths)
      await refreshAll()
      Toast.success('路径已保存')
    } catch (error) {
      Toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const resetAccountForm = () => {
    setAccountForm(EMPTY_ACCOUNT_FORM)
  }

  const handleRemoveAccount = (accountId: string) => {
    const account = settings.accounts.find((item) => item.id === accountId)
    if (!account) return

    Modal.confirm({
      title: '删除账号',
      content: `确定删除账号“${account.name || '未命名账号'}”吗？此操作不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        setSaving(true)
        try {
          const nextSettings = await window.desktopAPI.settings.removeAccount(accountId)
          setSettings(nextSettings)
          setProxyForm(nextSettings.proxy)
          setPathsForm({
            defaultDownloadDir: nextSettings.defaultDownloadDir,
            defaultExportDir: nextSettings.defaultExportDir,
          })

          const nextAccount = nextSettings.accounts.find((item) => item.id === nextSettings.activeAccountId)
            ?? nextSettings.accounts[0]
          if (nextAccount) {
            setAccountForm({ ...nextAccount })
          } else {
            resetAccountForm()
          }

          Toast.success('账号已删除')
        } catch (error) {
          Toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`)
          throw error
        } finally {
          setSaving(false)
        }
      },
    })
  }

  const cardStyle = {
    background: 'var(--color-surface)',
    borderRadius: 12,
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-sm)',
  }

  const cardHeaderStyle = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border)',
    fontWeight: 600 as const,
    fontSize: 14,
  }

  const cardBodyStyle = {
    padding: 20,
  }

  const sectionTitleStyle = {
    fontSize: 14,
    fontWeight: 600 as const,
    color: 'var(--color-text-primary)',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid var(--color-border)',
  }

  const fieldStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  }

  const labelStyle = {
    fontSize: 12,
    color: 'var(--color-text-tertiary)',
    fontWeight: 500 as const,
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>账号管理</div>
          <div style={cardBodyStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {activeAccount && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    border: '1px solid var(--primary-300)',
                    background: 'var(--primary-50)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        {(activeAccount.name || 'A').slice(0, 1)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{activeAccount.name || '未命名账号'}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                          {activeAccount.remark || '当前正在使用的账号'}
                        </div>
                      </div>
                    </div>
                    <Tag color="green" size="small">当前</Tag>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                所有账号
              </div>

              {settings.accounts.map((account) => (
                <div
                  key={account.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${account.id === accountForm.id ? 'var(--primary-500)' : 'var(--color-border)'}`,
                    background: account.id === accountForm.id ? 'var(--primary-50)' : 'var(--color-surface)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => setAccountForm({ ...account })}
                  onMouseEnter={(e) => {
                    if (account.id !== accountForm.id) {
                      e.currentTarget.style.borderColor = 'var(--primary-300)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (account.id !== accountForm.id) {
                      e.currentTarget.style.borderColor = 'var(--color-border)'
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: account.id === settings.activeAccountId
                            ? 'linear-gradient(135deg, var(--primary-500), var(--primary-600))'
                            : 'var(--gray-200)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: account.id === settings.activeAccountId ? 'white' : 'var(--gray-600)',
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {(account.name || 'A').slice(0, 1)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{account.name || '未命名账号'}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                          {account.remark || '无备注'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {account.isDefault && <Tag color="blue" size="small">默认</Tag>}
                      <Button
                        size="small"
                        type="tertiary"
                        icon={<IconDelete />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveAccount(account.id)
                        }}
                        loading={saving}
                        style={{
                          color: 'var(--error-600)',
                          borderColor: 'var(--error-200)',
                        }}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <div>
                <div style={sectionTitleStyle}>编辑账号</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>账号名称</span>
                      <Input
                        value={accountForm.name}
                        onChange={(value: string) => setAccountForm((prev) => ({ ...prev, name: value }))}
                        placeholder="输入账号名称"
                      />
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>备注</span>
                      <Input
                        value={accountForm.remark}
                        onChange={(value: string) => setAccountForm((prev) => ({ ...prev, remark: value }))}
                        placeholder="输入备注"
                      />
                    </div>
                  </div>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>Cookie</span>
                    <TextArea
                      value={accountForm.cookiesStr}
                      onChange={(value: string) => setAccountForm((prev) => ({ ...prev, cookiesStr: value }))}
                      autosize={{ minRows: 4, maxRows: 6 }}
                      placeholder="粘贴登录 Cookie"
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>设为默认账号</span>
                    <Switch
                      checked={accountForm.isDefault ?? false}
                      onChange={(checked: boolean) => setAccountForm((prev) => ({ ...prev, isDefault: checked }))}
                    />
                  </div>
                  <Button type="primary" loading={saving} onClick={handleSaveAccount}>
                    保存账号
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={cardHeaderStyle}>系统设置</div>
          <div style={cardBodyStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={sectionTitleStyle}>主题设置</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {THEME_OPTIONS.map((option) => {
                    const selected = themePreference === option.value

                    return (
                      <div
                        key={option.value}
                        onClick={() => setThemePreference(option.value)}
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          border: `1px solid ${selected ? 'var(--primary-500)' : 'var(--color-border)'}`,
                          background: selected ? 'var(--primary-50)' : 'var(--color-surface)',
                          boxShadow: selected ? '0 8px 20px rgba(59, 130, 246, 0.12)' : 'var(--shadow-sm)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <Checkbox
                          checked={selected}
                          onChange={() => setThemePreference(option.value)}
                          style={{ width: '100%', margin: 0 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                background: selected ? 'var(--primary-100)' : 'var(--gray-100)',
                                color: selected ? 'var(--primary-700)' : 'var(--color-text-tertiary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {option.icon}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {option.label}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-tertiary)' }}>
                                {option.description}
                              </div>
                            </div>
                          </div>
                        </Checkbox>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  选择后立即生效，无需点击保存。
                </div>
              </div>

              <div>
                <div style={sectionTitleStyle}>存储设置</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>默认下载目录</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Input
                        value={pathsForm.defaultDownloadDir}
                        onChange={(value: string) => setPathsForm((prev) => ({ ...prev, defaultDownloadDir: value }))}
                        placeholder="选择下载目录"
                        style={{ flex: 1 }}
                      />
                      <Button onClick={() => handlePickDirectory('defaultDownloadDir')}>
                        浏览
                      </Button>
                    </div>
                  </div>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>默认导出目录</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Input
                        value={pathsForm.defaultExportDir}
                        onChange={(value: string) => setPathsForm((prev) => ({ ...prev, defaultExportDir: value }))}
                        placeholder="选择导出目录"
                        style={{ flex: 1 }}
                      />
                      <Button onClick={() => handlePickDirectory('defaultExportDir')}>
                        浏览
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={sectionTitleStyle}>代理设置</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>启用代理</span>
                    <Switch
                      checked={proxyForm.enabled}
                      onChange={(checked: boolean) => setProxyForm((prev) => ({ ...prev, enabled: checked }))}
                    />
                  </div>
                  {proxyForm.enabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={fieldStyle}>
                        <span style={labelStyle}>代理地址</span>
                        <Input
                          value={proxyForm.server}
                          onChange={(value: string) => setProxyForm((prev) => ({ ...prev, server: value }))}
                          placeholder="127.0.0.1:7890"
                        />
                      </div>
                      <div style={fieldStyle}>
                        <span style={labelStyle}>绕过列表</span>
                        <Input
                          value={proxyForm.bypass}
                          onChange={(value: string) => setProxyForm((prev) => ({ ...prev, bypass: value }))}
                          placeholder="localhost,127.0.0.1"
                        />
                      </div>
                      <div style={fieldStyle}>
                        <span style={labelStyle}>用户名</span>
                        <Input
                          value={proxyForm.username}
                          onChange={(value: string) => setProxyForm((prev) => ({ ...prev, username: value }))}
                        />
                      </div>
                      <div style={fieldStyle}>
                        <span style={labelStyle}>密码</span>
                        <Input
                          value={proxyForm.password}
                          onChange={(value: string) => setProxyForm((prev) => ({ ...prev, password: value }))}
                          type="password"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Button type="primary" loading={saving} onClick={handleSaveSettings}>
                保存设置
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
