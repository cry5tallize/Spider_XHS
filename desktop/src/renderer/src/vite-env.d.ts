/// <reference types="vite/client" />

declare global {
  type DesktopProxySettings = {
    enabled: boolean
    server: string
    bypass: string
    username: string
    password: string
  }

  type DesktopAccountSettings = {
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

  type DesktopAppSettings = {
    activeAccountId: string
    accounts: DesktopAccountSettings[]
    proxy: DesktopProxySettings
    defaultDownloadDir: string
    defaultExportDir: string
  }

  type DesktopPcApiResult<T> = {
    success: boolean
    msg: string
    data: T | null
    rawText: string
    resJson: Record<string, unknown> | null
  }

  type StandardArchive<T> = {
    source: string
    success: boolean
    msg: string
    fetchedAt: string
    rawText: string
    rawJson: Record<string, unknown> | null
    normalized: T | null
  }

  type StandardUser = {
    userId: string
    homeUrl: string
    nickname: string
    avatar: string
    redId: string
    gender: string
    ipLocation: string
    desc: string
    follows: number
    fans: number
    interaction: number
    tags: string[]
  }

  type StandardNote = {
    noteId: string
    noteUrl: string
    noteType: '图集' | '视频' | '未知'
    userId: string
    homeUrl: string
    nickname: string
    avatar: string
    title: string
    desc: string
    likedCount: number
    collectedCount: number
    commentCount: number
    shareCount: number
    videoCover: string | null
    videoAddr: string | null
    videoStreams: StandardVideoStream[]
    imageList: string[]
    tags: string[]
    uploadTime: string
    ipLocation: string
  }

  type StandardVideoStream = {
    codec: string
    streamType: number
    streamDesc: string
    qualityType: string
    format: string
    videoCodec: string
    audioCodec: string
    width: number
    height: number
    fps: number
    size: number
    videoBitrate: number
    audioBitrate: number
    avgBitrate: number
    duration: number
    videoDuration: number
    audioDuration: number
    defaultStream: boolean
    hdrType: number
    rotate: number
    weight: number
    masterUrl: string
    backupUrls: string[]
  }

  type StandardComment = {
    noteId: string
    noteUrl: string
    commentId: string
    userId: string
    homeUrl: string
    nickname: string
    avatar: string
    content: string
    showTags: unknown[]
    likeCount: number
    uploadTime: string
    ipLocation: string
    pictures: string[]
    subComments: unknown[]
  }

  type StandardSearchNotes = {
    noteList: StandardNote[]
    pageResponses: StandardArchive<unknown>[]
  }

  type StandardSearchUsers = {
    userList: StandardUser[]
    pageResponses: StandardArchive<unknown>[]
  }

  type DesktopTaskAction =
    | 'note-info'
    | 'video-note-info'
    | 'user-info'
    | 'user-all-notes'
    | 'search-keyword'
    | 'search-note'
    | 'video-search-note'
    | 'search-user'
    | 'note-comments'
    | 'unread-message'
    | 'mentions'
    | 'mentions-all'
    | 'likes'
    | 'likes-all'
    | 'connections'
    | 'connections-all'
    | 'note-no-water-video'
    | 'note-no-water-img'

  type DesktopTaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  type DesktopTaskStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'

  type DesktopTaskStep = {
    id: string
    title: string
    status: DesktopTaskStepStatus
    input: Record<string, unknown>
    output: Record<string, unknown> | null
    error: string
    startedAt: string
    endedAt: string
  }

  type DesktopTaskTemplate = {
    id: string
    name: string
    action: DesktopTaskAction
    description: string
    defaultParams: Record<string, unknown>
    createdAt: string
    updatedAt: string
    builtin?: boolean
  }

  type DesktopTaskRun = {
    id: string
    templateId: string
    name: string
    action: DesktopTaskAction
    status: DesktopTaskStatus
    progress: number
    params: Record<string, unknown>
    result: Record<string, unknown> | null
    rawResult: Record<string, unknown> | null
    normalizedResult: Record<string, unknown> | null
    steps: DesktopTaskStep[]
    retryCount: number
    createdAt: string
    updatedAt: string
    startedAt: string
    endedAt: string
    cancelledAt: string
  }

  type DesktopNotePreviewArchive = {
    source: string
    success: boolean
    msg: string
    fetchedAt: string
    rawText: string
    rawJson: Record<string, unknown> | null
    normalized: StandardNote | null
  }

  type DesktopNotePreview = {
    url: string
    success: boolean
    msg: string
    archive: DesktopNotePreviewArchive | null
  }

  type DesktopNoteDownloadOptions = {
    downloadImages: boolean
    downloadVideo: boolean
    exportText: boolean
    exportRaw: boolean
    concurrency: number
    videoStreamUrl?: string
  }

  type DesktopDownloadProgress = {
    jobId: string
    phase: 'queued' | 'running' | 'finished' | 'error'
    total: number
    completed: number
    percent: number
    currentUrl: string
    currentTitle: string
    currentFile: string
    message: string
    exportRoot: string
    downloadRoot: string
    currentDownloadedBytes: number
    currentTotalBytes: number | null
    currentPercent: number | null
  }

  type DesktopDownloadSummary = {
    jobId: string
    success: boolean
    total: number
    completed: number
    failed: number
    exportRoot: string
    downloadRoot: string
    outputItems: Array<{
      url: string
      title: string
      noteId: string
      success: boolean
      message: string
      exportDir: string
      downloadDir: string
    }>
  }

  interface Window {
    desktopAPI: {
      appName: string
      getEnvironment: () => {
        electron: string | undefined
        chrome: string | undefined
        node: string | undefined
      }
      settings: {
        get: () => Promise<DesktopAppSettings>
        update: (patch: Partial<DesktopAppSettings>) => Promise<DesktopAppSettings>
        reset: () => Promise<DesktopAppSettings>
        upsertAccount: (account: Partial<DesktopAccountSettings> & { id?: string }) => Promise<DesktopAppSettings>
        removeAccount: (accountId: string) => Promise<DesktopAppSettings>
        setActiveAccount: (accountId: string) => Promise<DesktopAppSettings>
        pickDirectory: () => Promise<string>
      }
      pc: {
        getHomefeedAllChannel: (cookiesStr?: string) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getHomefeedRecommend: (payload: {
          category: string
          cursorScore?: string
          refreshType?: number
          noteIndex?: number
          cookiesStr?: string
        }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getHomefeedRecommendByNum: (payload: {
          category: string
          requireNum?: number
          cookiesStr?: string
        }) => Promise<DesktopPcApiResult<{ noteList: unknown[]; pageResponses: unknown[] }>>
        getUserInfo: (payload: { userId: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getUserNoteInfo: (payload: {
          userId: string
          cursor?: string
          cookiesStr?: string
          xsecToken?: string
          xsecSource?: string
        }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getUserAllNotes: (payload: { userUrl: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<{ noteList: unknown[]; pageResponses: unknown[] }>>
        getNoteInfo: (payload: { url: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getSearchKeyword: (payload: { word: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getSearchNote: (payload: {
          query: string
          page?: number
          sortTypeChoice?: number
          noteType?: number
          noteTime?: number
          noteRange?: number
          posDistance?: number
          geo?: Record<string, unknown> | string
          cookiesStr?: string
        }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getSearchSomeNote: (payload: {
          query: string
          requireNum?: number
          sortTypeChoice?: number
          noteType?: number
          noteTime?: number
          noteRange?: number
          posDistance?: number
          geo?: Record<string, unknown> | string
          cookiesStr?: string
        }) => Promise<DesktopPcApiResult<{ noteList: unknown[]; pageResponses: unknown[] }>>
        getSearchUser: (payload: { query: string; page?: number; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getSearchSomeUser: (payload: { query: string; requireNum?: number; cookiesStr?: string }) => Promise<DesktopPcApiResult<{ userList: unknown[]; pageResponses: unknown[] }>>
        getNoteOutComment: (payload: { noteId: string; cursor?: string; xsecToken: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getNoteAllOutComment: (payload: { noteId: string; xsecToken: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<{ noteOutCommentList: unknown[]; pageResponses: unknown[] }>>
        getNoteInnerComment: (payload: {
          comment: Record<string, unknown>
          cursor?: string
          xsecToken: string
          cookiesStr?: string
        }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getNoteAllInnerComment: (payload: {
          comment: Record<string, unknown>
          xsecToken: string
          cookiesStr?: string
        }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getNoteAllComment: (payload: { url: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>[]>>
        getUnreadMessage: (payload: { cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getMentions: (payload: { cursor?: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getAllMentions: (payload: { cookiesStr?: string }) => Promise<DesktopPcApiResult<{ metionsList: unknown[]; pageResponses: unknown[] }>>
        getLikesAndCollects: (payload: { cursor?: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getAllLikesAndCollects: (payload: { cookiesStr?: string }) => Promise<DesktopPcApiResult<{ likesAndCollectsList: unknown[]; pageResponses: unknown[] }>>
        getNewConnections: (payload: { cursor?: string; cookiesStr?: string }) => Promise<DesktopPcApiResult<Record<string, unknown>>>
        getAllNewConnections: (payload: { cookiesStr?: string }) => Promise<DesktopPcApiResult<{ connectionsList: unknown[]; pageResponses: unknown[] }>>
        getNoteNoWaterVideo: (payload: { noteId: string }) => Promise<DesktopPcApiResult<string>>
        getNoteNoWaterImg: (payload: { imgUrl: string }) => Promise<DesktopPcApiResult<string>>
        standardizeUser: (payload: { raw: unknown; userId?: string }) => Promise<DesktopPcApiResult<StandardArchive<StandardUser>>>
        standardizeNote: (payload: { raw: unknown }) => Promise<DesktopPcApiResult<StandardArchive<StandardNote>>>
        standardizeComment: (payload: { raw: unknown }) => Promise<DesktopPcApiResult<StandardArchive<StandardComment>>>
        standardizeSearchNotes: (payload: { items: unknown[] }) => Promise<DesktopPcApiResult<StandardArchive<StandardSearchNotes>>>
        standardizeSearchUsers: (payload: { items: unknown[] }) => Promise<DesktopPcApiResult<StandardArchive<StandardSearchUsers>>>
      }
      tasks: {
        listTemplates: () => Promise<DesktopTaskTemplate[]>
        upsertTemplate: (payload: Partial<DesktopTaskTemplate> & { action: DesktopTaskAction; name: string }) => Promise<DesktopTaskTemplate>
        removeTemplate: (templateId: string) => Promise<DesktopTaskTemplate[]>
        list: () => Promise<DesktopTaskRun[]>
        create: (payload: { templateId?: string; name?: string; action?: DesktopTaskAction; params?: Record<string, unknown> }) => Promise<DesktopTaskRun>
        run: (payload: { taskId: string; cookiesStr?: string }) => Promise<DesktopTaskRun | null>
        retry: (payload: { taskId: string; cookiesStr?: string }) => Promise<DesktopTaskRun | null>
        rerun: (payload: { taskId: string; cookiesStr?: string }) => Promise<DesktopTaskRun | null>
        reparse: (payload: { taskId: string }) => Promise<DesktopTaskRun | null>
        cancel: (payload: { taskId: string }) => Promise<DesktopTaskRun | null>
        remove: (payload: { taskId: string }) => Promise<DesktopTaskRun[]>
        export: (payload: { taskId: string; videoStreamUrl?: string }) => Promise<{ success: boolean; msg: string; exportPath: string } | null>
        onExportProgress: (handler: (progress: DesktopDownloadProgress) => void) => () => void
        previewNotes: (payload: { urls: string[]; cookiesStr?: string }) => Promise<DesktopNotePreview[]>
        downloadNotes: (payload: {
          jobId?: string
          items: Array<DesktopNotePreview & Partial<DesktopNoteDownloadOptions>>
          options: DesktopNoteDownloadOptions
          cookiesStr?: string
        }) => Promise<DesktopDownloadSummary>
        onDownloadProgress: (handler: (progress: DesktopDownloadProgress) => void) => () => void
      }
    }
  }
}

export {}
