import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopAPI', {
  appName: 'Spider XHS Desktop',
  getEnvironment() {
    return {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    }
  },
  settings: {
    get() {
      return ipcRenderer.invoke('settings:get')
    },
    update(patch: Record<string, unknown>) {
      return ipcRenderer.invoke('settings:update', patch)
    },
    reset() {
      return ipcRenderer.invoke('settings:reset')
    },
    upsertAccount(account: Record<string, unknown>) {
      return ipcRenderer.invoke('settings:account:upsert', account)
    },
    removeAccount(accountId: string) {
      return ipcRenderer.invoke('settings:account:remove', accountId)
    },
    setActiveAccount(accountId: string) {
      return ipcRenderer.invoke('settings:account:set-active', accountId)
    },
    pickDirectory() {
      return ipcRenderer.invoke('settings:pick-directory')
    },
  },
  pc: {
    getHomefeedAllChannel(cookiesStr?: string) {
      return ipcRenderer.invoke('pc:homefeed:channels', cookiesStr)
    },
    getHomefeedRecommend(payload: {
      category: string
      cursorScore?: string
      refreshType?: number
      noteIndex?: number
      cookiesStr?: string
    }) {
      return ipcRenderer.invoke('pc:homefeed:recommend', payload)
    },
    getHomefeedRecommendByNum(payload: {
      category: string
      requireNum?: number
      cookiesStr?: string
    }) {
      return ipcRenderer.invoke('pc:homefeed:recommend-by-num', payload)
    },
    getUserInfo(payload: { userId: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:user:info', payload)
    },
    getUserNoteInfo(payload: {
      userId: string
      cursor?: string
      cookiesStr?: string
      xsecToken?: string
      xsecSource?: string
    }) {
      return ipcRenderer.invoke('pc:user:notes', payload)
    },
    getUserAllNotes(payload: { userUrl: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:user:all-notes', payload)
    },
    getNoteInfo(payload: { url: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:note:info', payload)
    },
    getSearchKeyword(payload: { word: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:search:keyword', payload)
    },
    getSearchNote(payload: {
      query: string
      page?: number
      sortTypeChoice?: number
      noteType?: number
      noteTime?: number
      noteRange?: number
      posDistance?: number
      geo?: Record<string, unknown> | string
      cookiesStr?: string
    }) {
      return ipcRenderer.invoke('pc:search:notes', payload)
    },
    getSearchSomeNote(payload: {
      query: string
      requireNum?: number
      sortTypeChoice?: number
      noteType?: number
      noteTime?: number
      noteRange?: number
      posDistance?: number
      geo?: Record<string, unknown> | string
      cookiesStr?: string
    }) {
      return ipcRenderer.invoke('pc:search:notes-by-num', payload)
    },
    getSearchUser(payload: { query: string; page?: number; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:search:users', payload)
    },
    getSearchSomeUser(payload: { query: string; requireNum?: number; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:search:users-by-num', payload)
    },
    getNoteOutComment(payload: { noteId: string; cursor?: string; xsecToken: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:comment:top', payload)
    },
    getNoteAllOutComment(payload: { noteId: string; xsecToken: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:comment:all-top', payload)
    },
    getNoteInnerComment(payload: {
      comment: Record<string, unknown>
      cursor?: string
      xsecToken: string
      cookiesStr?: string
    }) {
      return ipcRenderer.invoke('pc:comment:inner', payload)
    },
    getNoteAllInnerComment(payload: {
      comment: Record<string, unknown>
      xsecToken: string
      cookiesStr?: string
    }) {
      return ipcRenderer.invoke('pc:comment:all-inner', payload)
    },
    getNoteAllComment(payload: { url: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:comment:all', payload)
    },
    getUnreadMessage(payload: { cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:message:unread', payload)
    },
    getMentions(payload: { cursor?: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:message:mentions', payload)
    },
    getAllMentions(payload: { cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:message:mentions-all', payload)
    },
    getLikesAndCollects(payload: { cursor?: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:message:likes', payload)
    },
    getAllLikesAndCollects(payload: { cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:message:likes-all', payload)
    },
    getNewConnections(payload: { cursor?: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:message:connections', payload)
    },
    getAllNewConnections(payload: { cookiesStr?: string }) {
      return ipcRenderer.invoke('pc:message:connections-all', payload)
    },
    getNoteNoWaterVideo(payload: { noteId: string }) {
      return ipcRenderer.invoke('pc:note:no-water-video', payload)
    },
    getNoteNoWaterImg(payload: { imgUrl: string }) {
      return ipcRenderer.invoke('pc:note:no-water-img', payload)
    },
    standardizeUser(payload: { raw: unknown; userId?: string }) {
      return ipcRenderer.invoke('pc:standardize:user', payload)
    },
    standardizeNote(payload: { raw: unknown }) {
      return ipcRenderer.invoke('pc:standardize:note', payload)
    },
    standardizeComment(payload: { raw: unknown }) {
      return ipcRenderer.invoke('pc:standardize:comment', payload)
    },
    standardizeSearchNotes(payload: { items: unknown[] }) {
      return ipcRenderer.invoke('pc:standardize:search-notes', payload)
    },
    standardizeSearchUsers(payload: { items: unknown[] }) {
      return ipcRenderer.invoke('pc:standardize:search-users', payload)
    },
  },
  tasks: {
    listTemplates() {
      return ipcRenderer.invoke('task:templates:list')
    },
    upsertTemplate(payload: Record<string, unknown>) {
      return ipcRenderer.invoke('task:templates:upsert', payload)
    },
    removeTemplate(templateId: string) {
      return ipcRenderer.invoke('task:templates:remove', templateId)
    },
    list() {
      return ipcRenderer.invoke('task:list')
    },
    create(payload: Record<string, unknown>) {
      return ipcRenderer.invoke('task:create', payload)
    },
    run(payload: { taskId: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('task:run', payload)
    },
    retry(payload: { taskId: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('task:retry', payload)
    },
    rerun(payload: { taskId: string; cookiesStr?: string }) {
      return ipcRenderer.invoke('task:rerun', payload)
    },
    reparse(payload: { taskId: string }) {
      return ipcRenderer.invoke('task:reparse', payload)
    },
    cancel(payload: { taskId: string }) {
      return ipcRenderer.invoke('task:cancel', payload)
    },
    remove(payload: { taskId: string }) {
      return ipcRenderer.invoke('task:remove', payload)
    },
    export(payload: { taskId: string; videoStreamUrl?: string }) {
      return ipcRenderer.invoke('task:export', payload)
    },
    onExportProgress(handler: (progress: Record<string, unknown>) => void) {
      const listener = (_event: Electron.IpcRendererEvent, progress: Record<string, unknown>) => {
        handler(progress)
      }
      ipcRenderer.on('task:export-progress', listener)
      return () => {
        ipcRenderer.removeListener('task:export-progress', listener)
      }
    },
    previewNotes(payload: { urls: string[]; cookiesStr?: string }) {
      return ipcRenderer.invoke('tasks:preview-notes', payload)
    },
    downloadNotes(payload: {
      jobId?: string
      items: Array<Record<string, unknown> & Partial<{
        downloadImages: boolean
        downloadVideo: boolean
        exportText: boolean
        exportRaw: boolean
        concurrency: number
      }>>
      options: {
        downloadImages: boolean
        downloadVideo: boolean
        exportText: boolean
        exportRaw: boolean
        concurrency: number
      }
      cookiesStr?: string
    }) {
      return ipcRenderer.invoke('tasks:download-notes', payload)
    },
    onDownloadProgress(handler: (progress: Record<string, unknown>) => void) {
      const listener = (_event: Electron.IpcRendererEvent, progress: Record<string, unknown>) => {
        handler(progress)
      }
      ipcRenderer.on('tasks:download-progress', listener)
      return () => {
        ipcRenderer.removeListener('tasks:download-progress', listener)
      }
    },
  },
})
