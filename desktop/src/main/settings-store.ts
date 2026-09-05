import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getProjectDataPath } from './data-path'

export type ProxySettings = {
  enabled: boolean
  server: string
  bypass: string
  username: string
  password: string
}

export type AccountSettings = {
  id: string
  name: string
  remark: string
  cookiesStr: string
  defaultDownloadDir: string
  defaultExportDir: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type AppSettings = {
  activeAccountId: string
  accounts: AccountSettings[]
  proxy: ProxySettings
  defaultDownloadDir: string
  defaultExportDir: string
}

const DEFAULT_SETTINGS: AppSettings = {
  activeAccountId: '',
  accounts: [],
  proxy: {
    enabled: false,
    server: '',
    bypass: '',
    username: '',
    password: '',
  },
  defaultDownloadDir: '',
  defaultExportDir: '',
}

function getSettingsPath() {
  return getProjectDataPath('settings.json')
}

function ensureSettingsDir() {
  mkdirSync(dirname(getSettingsPath()), { recursive: true })
}

function normalizeSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  const proxy = settings?.proxy ?? {}
  return {
    activeAccountId: settings?.activeAccountId ?? DEFAULT_SETTINGS.activeAccountId,
    accounts: Array.isArray(settings?.accounts) ? settings.accounts : [],
    proxy: {
      enabled: Boolean(proxy.enabled),
      server: proxy.server ?? '',
      bypass: proxy.bypass ?? '',
      username: proxy.username ?? '',
      password: proxy.password ?? '',
    },
    defaultDownloadDir: settings?.defaultDownloadDir ?? '',
    defaultExportDir: settings?.defaultExportDir ?? '',
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(getSettingsPath(), 'utf-8')
    return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings: AppSettings) {
  ensureSettingsDir()
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function updateSettings(patch: Partial<AppSettings>) {
  const nextSettings = normalizeSettings({
    ...loadSettings(),
    ...patch,
    proxy: {
      ...loadSettings().proxy,
      ...patch.proxy,
    },
  })
  saveSettings(nextSettings)
  return nextSettings
}

export function resetSettings() {
  saveSettings(DEFAULT_SETTINGS)
  return normalizeSettings(DEFAULT_SETTINGS)
}

export function upsertAccount(account: Partial<AccountSettings> & { id?: string }) {
  const settings = loadSettings()
  const now = new Date().toISOString()
  const accountId = account.id ?? `${Date.now()}`
  const nextAccount: AccountSettings = {
    id: accountId,
    name: account.name ?? '',
    remark: account.remark ?? '',
    cookiesStr: account.cookiesStr ?? '',
    defaultDownloadDir: account.defaultDownloadDir ?? '',
    defaultExportDir: account.defaultExportDir ?? '',
    isDefault: Boolean(account.isDefault),
    createdAt: account.createdAt ?? now,
    updatedAt: now,
  }

  const accountIndex = settings.accounts.findIndex((item) => item.id === accountId)
  if (accountIndex >= 0) {
    settings.accounts[accountIndex] = {
      ...settings.accounts[accountIndex],
      ...nextAccount,
      createdAt: settings.accounts[accountIndex].createdAt,
    }
  } else {
    settings.accounts.push(nextAccount)
  }

  if (nextAccount.isDefault) {
    settings.accounts = settings.accounts.map((item) => ({
      ...item,
      isDefault: item.id === accountId,
    }))
    settings.activeAccountId = accountId
  } else if (!settings.activeAccountId && settings.accounts.length > 0) {
    settings.activeAccountId = settings.accounts[0].id
  }

  saveSettings(settings)
  return settings
}

export function removeAccount(accountId: string) {
  const settings = loadSettings()
  settings.accounts = settings.accounts.filter((account) => account.id !== accountId)

  if (settings.activeAccountId === accountId) {
    settings.activeAccountId = settings.accounts[0]?.id ?? ''
  }

  settings.accounts = settings.accounts.map((account) => ({
    ...account,
    isDefault: account.id === settings.activeAccountId,
  }))

  saveSettings(settings)
  return settings
}

export function setActiveAccount(accountId: string) {
  const settings = loadSettings()
  settings.activeAccountId = accountId
  settings.accounts = settings.accounts.map((account) => ({
    ...account,
    isDefault: account.id === accountId,
  }))
  saveSettings(settings)
  return settings
}
