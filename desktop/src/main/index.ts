import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import {
  loadSettings,
  removeAccount,
  resetSettings,
  setActiveAccount,
  updateSettings,
  upsertAccount,
} from './settings-store'
import { xhsPcApi } from './xhs-pc-api'
import {
  cancelTask,
  exportTask,
  createTask,
  listTasks,
  listTemplates,
  reparseTask,
  rerunTask,
  retryTask,
  runTask,
  removeTemplate,
  removeTask,
  upsertTemplate,
} from './task-manager'
import { downloadPreviewNotes, previewNoteUrls } from './note-workbench'

const isDev = !!process.env.ELECTRON_RENDERER_URL

// Make Desktop app portable: keep Electron userData alongside the executable.
// This also changes the default %AppData%/Roaming/<name> folder name.
const PORTABLE_APP_NAME = 'Spider_XHS'
app.setName(PORTABLE_APP_NAME)
app.setPath('userData', join(dirname(app.getPath('exe')), 'userData'))

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#f6f8fb',
    title: 'Spider XHS Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.removeMenu()
  mainWindow.setMenuBarVisibility(false)

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL as string)
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    })
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isToggleDevTools = input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')
      if (isToggleDevTools) {
        event.preventDefault()
        mainWindow.webContents.toggleDevTools()
      }
    })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:update', (_event, patch) => updateSettings(patch ?? {}))
  ipcMain.handle('settings:reset', () => resetSettings())
  ipcMain.handle('settings:account:upsert', (_event, account) => upsertAccount(account ?? {}))
  ipcMain.handle('settings:account:remove', (_event, accountId: string) => removeAccount(accountId))
  ipcMain.handle('settings:account:set-active', (_event, accountId: string) => setActiveAccount(accountId))
  ipcMain.handle('settings:pick-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? '' : result.filePaths[0]
  })

  const resolveCookiesStr = (cookiesStr?: string) => {
    if (cookiesStr && cookiesStr.trim()) {
      return cookiesStr
    }

    const settings = loadSettings()
    const activeAccount = settings.accounts.find((account) => account.id === settings.activeAccountId)
      ?? settings.accounts.find((account) => account.cookiesStr)
    return activeAccount?.cookiesStr ?? ''
  }

  ipcMain.handle('pc:homefeed:channels', (_event, cookiesStr?: string) => {
    return xhsPcApi.getHomefeedAllChannel(resolveCookiesStr(cookiesStr))
  })
  ipcMain.handle('pc:homefeed:recommend', (_event, payload) => {
    return xhsPcApi.getHomefeedRecommend(
      payload?.category ?? '',
      payload?.cursorScore ?? '',
      Number(payload?.refreshType ?? 1),
      Number(payload?.noteIndex ?? 0),
      resolveCookiesStr(payload?.cookiesStr),
    )
  })
  ipcMain.handle('pc:homefeed:recommend-by-num', (_event, payload) => {
    return xhsPcApi.getHomefeedRecommendByNum(
      payload?.category ?? '',
      Number(payload?.requireNum ?? 20),
      resolveCookiesStr(payload?.cookiesStr),
    )
  })
  ipcMain.handle('pc:user:info', (_event, payload) => {
    return xhsPcApi.getUserInfo(payload?.userId ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:user:notes', (_event, payload) => {
    return xhsPcApi.getUserNoteInfo(
      payload?.userId ?? '',
      payload?.cursor ?? '',
      resolveCookiesStr(payload?.cookiesStr),
      payload?.xsecToken ?? '',
      payload?.xsecSource ?? '',
    )
  })
  ipcMain.handle('pc:user:all-notes', (_event, payload) => {
    return xhsPcApi.getUserAllNotes(payload?.userUrl ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:note:info', (_event, payload) => {
    return xhsPcApi.getNoteInfo(payload?.url ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:search:keyword', (_event, payload) => {
    return xhsPcApi.getSearchKeyword(payload?.word ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:search:notes', (_event, payload) => {
    return xhsPcApi.searchNote(
      payload?.query ?? '',
      resolveCookiesStr(payload?.cookiesStr),
      Number(payload?.page ?? 1),
      Number(payload?.sortTypeChoice ?? 0),
      Number(payload?.noteType ?? 0),
      Number(payload?.noteTime ?? 0),
      Number(payload?.noteRange ?? 0),
      Number(payload?.posDistance ?? 0),
      payload?.geo ?? '',
    )
  })
  ipcMain.handle('pc:search:notes-by-num', (_event, payload) => {
    return xhsPcApi.searchSomeNote(
      payload?.query ?? '',
      Number(payload?.requireNum ?? 20),
      resolveCookiesStr(payload?.cookiesStr),
      Number(payload?.sortTypeChoice ?? 0),
      Number(payload?.noteType ?? 0),
      Number(payload?.noteTime ?? 0),
      Number(payload?.noteRange ?? 0),
      Number(payload?.posDistance ?? 0),
      payload?.geo ?? '',
    )
  })
  ipcMain.handle('pc:search:users', (_event, payload) => {
    return xhsPcApi.searchUser(payload?.query ?? '', resolveCookiesStr(payload?.cookiesStr), Number(payload?.page ?? 1))
  })
  ipcMain.handle('pc:search:users-by-num', (_event, payload) => {
    return xhsPcApi.searchSomeUser(
      payload?.query ?? '',
      Number(payload?.requireNum ?? 20),
      resolveCookiesStr(payload?.cookiesStr),
    )
  })
  ipcMain.handle('pc:comment:top', (_event, payload) => {
    return xhsPcApi.getNoteOutComment(
      payload?.noteId ?? '',
      payload?.cursor ?? '',
      payload?.xsecToken ?? '',
      resolveCookiesStr(payload?.cookiesStr),
    )
  })
  ipcMain.handle('pc:comment:all-top', (_event, payload) => {
    return xhsPcApi.getNoteAllOutComment(
      payload?.noteId ?? '',
      payload?.xsecToken ?? '',
      resolveCookiesStr(payload?.cookiesStr),
    )
  })
  ipcMain.handle('pc:comment:inner', (_event, payload) => {
    return xhsPcApi.getNoteInnerComment(
      payload?.comment ?? {},
      payload?.cursor ?? '',
      payload?.xsecToken ?? '',
      resolveCookiesStr(payload?.cookiesStr),
    )
  })
  ipcMain.handle('pc:comment:all-inner', (_event, payload) => {
    return xhsPcApi.getNoteAllInnerComment(
      payload?.comment ?? {},
      payload?.xsecToken ?? '',
      resolveCookiesStr(payload?.cookiesStr),
    )
  })
  ipcMain.handle('pc:comment:all', (_event, payload) => {
    return xhsPcApi.getNoteAllComment(payload?.url ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:message:unread', (_event, payload) => {
    return xhsPcApi.getUnreadMessage(resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:message:mentions', (_event, payload) => {
    return xhsPcApi.getMetions(payload?.cursor ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:message:mentions-all', (_event, payload) => {
    return xhsPcApi.getAllMetions(resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:message:likes', (_event, payload) => {
    return xhsPcApi.getLikesAndCollects(payload?.cursor ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:message:likes-all', (_event, payload) => {
    return xhsPcApi.getAllLikesAndCollects(resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:message:connections', (_event, payload) => {
    return xhsPcApi.getNewConnections(payload?.cursor ?? '', resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:message:connections-all', (_event, payload) => {
    return xhsPcApi.getAllNewConnections(resolveCookiesStr(payload?.cookiesStr))
  })
  ipcMain.handle('pc:note:no-water-video', (_event, payload) => {
    return xhsPcApi.getNoteNoWaterVideo(payload?.noteId ?? '')
  })
  ipcMain.handle('pc:note:no-water-img', (_event, payload) => {
    return xhsPcApi.getNoteNoWaterImg(payload?.imgUrl ?? '')
  })
  ipcMain.handle('pc:standardize:user', (_event, payload) => {
    return xhsPcApi.standardizeUserInfo(payload?.raw ?? null, payload?.userId ?? '')
  })
  ipcMain.handle('pc:standardize:note', (_event, payload) => {
    return xhsPcApi.standardizeNoteInfo(payload?.raw ?? null)
  })
  ipcMain.handle('pc:standardize:comment', (_event, payload) => {
    return xhsPcApi.standardizeCommentInfo(payload?.raw ?? null)
  })
  ipcMain.handle('pc:standardize:search-notes', (_event, payload) => {
    return xhsPcApi.standardizeSearchNoteItems(Array.isArray(payload?.items) ? payload.items : [])
  })
  ipcMain.handle('pc:standardize:search-users', (_event, payload) => {
    return xhsPcApi.standardizeSearchUserItems(Array.isArray(payload?.items) ? payload.items : [])
  })

  const resolveTaskCookiesStr = (cookiesStr?: string) => {
    if (cookiesStr && cookiesStr.trim()) {
      return cookiesStr
    }

    const settings = loadSettings()
    const activeAccount = settings.accounts.find((account) => account.id === settings.activeAccountId)
      ?? settings.accounts.find((account) => account.cookiesStr)
    return activeAccount?.cookiesStr ?? ''
  }

  ipcMain.handle('task:templates:list', () => listTemplates())
  ipcMain.handle('task:templates:upsert', (_event, payload) => upsertTemplate(payload ?? {}))
  ipcMain.handle('task:templates:remove', (_event, templateId: string) => removeTemplate(templateId))
  ipcMain.handle('task:list', () => listTasks())
  ipcMain.handle('task:create', (_event, payload) => createTask(payload ?? {}))
  ipcMain.handle('task:run', (_event, payload) => runTask(payload?.taskId ?? '', xhsPcApi, resolveTaskCookiesStr(payload?.cookiesStr)))
  ipcMain.handle('task:retry', (_event, payload) => retryTask(payload?.taskId ?? '', xhsPcApi, resolveTaskCookiesStr(payload?.cookiesStr)))
  ipcMain.handle('task:rerun', (_event, payload) => rerunTask(payload?.taskId ?? '', xhsPcApi, resolveTaskCookiesStr(payload?.cookiesStr)))
  ipcMain.handle('task:reparse', (_event, payload) => reparseTask(payload?.taskId ?? '', xhsPcApi))
  ipcMain.handle('task:cancel', (_event, payload) => cancelTask(payload?.taskId ?? ''))
  ipcMain.handle('task:remove', (_event, payload) => removeTask(payload?.taskId ?? ''))
  ipcMain.handle('task:export', (event, payload) => exportTask(
    payload?.taskId ?? '',
    loadSettings(),
    { videoStreamUrl: payload?.videoStreamUrl ?? '' },
    (progress) => event.sender.send('task:export-progress', progress),
  ))
  ipcMain.handle('tasks:preview-notes', async (_event, payload) => {
    const cookiesStr = resolveTaskCookiesStr(payload?.cookiesStr)
    const urls = Array.isArray(payload?.urls) ? payload.urls.map((item: unknown) => String(item ?? '')).filter(Boolean) : []
    return previewNoteUrls(urls, cookiesStr, xhsPcApi)
  })
  ipcMain.handle('tasks:download-notes', async (event, payload) => {
    const summary = await downloadPreviewNotes(
      {
        jobId: payload?.jobId,
        items: Array.isArray(payload?.items) ? payload.items : [],
        options: {
          downloadImages: Boolean(payload?.options?.downloadImages),
          downloadVideo: Boolean(payload?.options?.downloadVideo),
          exportText: Boolean(payload?.options?.exportText),
          exportRaw: Boolean(payload?.options?.exportRaw),
          concurrency: Number(payload?.options?.concurrency ?? 4),
        },
      },
      loadSettings(),
      (progress) => event.sender.send('tasks:download-progress', progress),
    )
    return summary
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
