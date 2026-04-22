import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getProjectDataPath } from './data-path'

type NoteArchive = {
  source: string
  success: boolean
  msg: string
  fetchedAt: string
  rawText: string
  rawJson: Record<string, unknown> | null
  normalized: Record<string, unknown> | null
}

export type NotePreviewItem = {
  url: string
  success: boolean
  msg: string
  archive: NoteArchive | null
}

export type DownloadOptions = {
  downloadImages: boolean
  downloadVideo: boolean
  exportText: boolean
  exportRaw: boolean
  concurrency: number
}

export type DownloadItem = NotePreviewItem & Partial<DownloadOptions>

export type DownloadProgress = {
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

export type DownloadSummary = {
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

type Downloader = {
  getNoteInfo: (url: string, cookiesStr: string) => Promise<{ success: boolean; msg: string; data: unknown; rawText: string; resJson: Record<string, unknown> | null }>
  standardizeNoteInfo: (raw: unknown) => { source: string; success: boolean; msg: string; fetchedAt: string; rawText: string; rawJson: Record<string, unknown> | null; normalized: Record<string, unknown> | null }
}

type DownloadTask = {
  label: string
  filePath: string
  currentUrl: string
  currentTitle: string
  run: () => Promise<void>
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'note'
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

function clampConcurrency(concurrency: number) {
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    return 1
  }
  return Math.min(Math.floor(concurrency), 8)
}

function getExportRoot(settings: { defaultExportDir?: string }) {
  return settings.defaultExportDir?.trim() || getProjectDataPath('exports')
}

function getDownloadRoot(settings: { defaultDownloadDir?: string }) {
  return settings.defaultDownloadDir?.trim() || getProjectDataPath('downloads')
}

function createJobId() {
  return `download-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function extractNoteId(url: string) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
  } catch {
    return ''
  }
}

function buildNoteFolderName(note: Record<string, unknown>, url: string) {
  const noteId = String(note.noteId ?? note.note_id ?? extractNoteId(url) ?? 'note')
  const title = String(note.title ?? note.nickname ?? 'note')
  return `${sanitizeFileName(title)}_${sanitizeFileName(noteId)}`
}

function buildTextContent(note: Record<string, unknown>, url: string) {
  const lines = [
    `标题: ${String(note.title ?? '')}`,
    `作者: ${String(note.nickname ?? '')}`,
    `类型: ${String(note.noteType ?? '')}`,
    `链接: ${url}`,
    `笔记ID: ${String(note.noteId ?? '')}`,
    `用户ID: ${String(note.userId ?? '')}`,
    `发布时间: ${String(note.uploadTime ?? '')}`,
    `IP归属地: ${String(note.ipLocation ?? '')}`,
    `点赞: ${String(note.likedCount ?? 0)}`,
    `收藏: ${String(note.collectedCount ?? 0)}`,
    `评论: ${String(note.commentCount ?? 0)}`,
    `分享: ${String(note.shareCount ?? 0)}`,
    '',
    '正文:',
    String(note.desc ?? ''),
    '',
    `标签: ${(Array.isArray(note.tags) ? note.tags : []).join(', ')}`,
  ]
  return lines.join('\n')
}

type FileProgress = {
  downloadedBytes: number
  totalBytes: number | null
  percent: number | null
}

async function downloadToFile(url: string, filePath: string, onProgress?: (progress: FileProgress) => void) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`下载失败: ${response.status}`)
  }

  ensureDir(dirname(filePath))
  const stream = createWriteStream(filePath)
  const reader = response.body.getReader()
  const totalHeader = response.headers.get('content-length')
  const totalBytes = totalHeader ? Number(totalHeader) : NaN
  const knownTotalBytes = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null
  let downloadedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    stream.write(Buffer.from(value))
    downloadedBytes += value.length
    onProgress?.({
      downloadedBytes,
      totalBytes: knownTotalBytes,
      percent: knownTotalBytes ? Math.min(100, Math.round((downloadedBytes / knownTotalBytes) * 100)) : null,
    })
  }

  stream.end()
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve())
    stream.on('error', reject)
  })

  onProgress?.({
    downloadedBytes,
    totalBytes: knownTotalBytes,
    percent: knownTotalBytes ? 100 : null,
  })
}

function resolveVideoDownloadUrl(note: Record<string, unknown>, selectedUrl?: string) {
  const chosen = selectedUrl?.trim()
  if (chosen) {
    return chosen
  }

  const fallback = String(note.videoAddr ?? '')
  if (fallback) {
    return fallback
  }

  const streams = Array.isArray(note.videoStreams) ? note.videoStreams : []
  const first = streams[0] && typeof streams[0] === 'object' ? streams[0] as Record<string, unknown> : null
  return String(first?.masterUrl ?? '')
}

async function mapLimit<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  const limit = clampConcurrency(concurrency)
  const running = new Set<Promise<void>>()

  for (let index = 0; index < items.length; index += 1) {
    const task = Promise.resolve().then(() => worker(items[index], index))
    running.add(task)
    task.finally(() => running.delete(task))

    if (running.size >= limit) {
      await Promise.race(running)
    }
  }

  await Promise.all(running)
}

function isVideoNote(note: Record<string, unknown>) {
  return note.noteType === '视频' || Boolean(note.videoAddr)
}

function isImageNote(note: Record<string, unknown>) {
  return Array.isArray(note.imageList) && note.imageList.length > 0
}

function toRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export async function previewNoteUrls(urls: string[], cookiesStr: string, pcApi: Downloader) {
  const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))]
  const previews: NotePreviewItem[] = []

  for (const url of uniqueUrls) {
    try {
      const result = await pcApi.getNoteInfo(url, cookiesStr)
      const archive = result.data ? pcApi.standardizeNoteInfo(result.data) : null
      previews.push({
        url,
        success: Boolean(result.success && archive?.success),
        msg: archive?.msg ?? result.msg ?? 'success',
        archive,
      })
    } catch (error) {
      previews.push({
        url,
        success: false,
        msg: error instanceof Error ? error.message : '解析失败',
        archive: null,
      })
    }
  }

  return previews
}

export async function downloadPreviewNotes(
  payload: {
    jobId?: string
    items: DownloadItem[]
    options: DownloadOptions
  },
  settings: { defaultDownloadDir?: string; defaultExportDir?: string },
  onProgress: (progress: DownloadProgress) => void,
) {
  const jobId = payload.jobId ?? createJobId()
  const exportRoot = getExportRoot(settings)
  const downloadRoot = getDownloadRoot(settings)
  const options = {
    ...payload.options,
    concurrency: clampConcurrency(payload.options.concurrency),
  }
  const usableItems = payload.items.filter((item) => item.success && item.archive?.normalized)
  const outputItems: DownloadSummary['outputItems'] = []
  const jobs: DownloadTask[] = []

  for (const item of usableItems) {
    const note = toRecord(item.archive?.normalized)
    if (!note) {
      continue
    }

    const itemOptions = {
      downloadImages: item.downloadImages ?? options.downloadImages,
      downloadVideo: item.downloadVideo ?? options.downloadVideo,
      exportText: item.exportText ?? options.exportText,
      exportRaw: item.exportRaw ?? options.exportRaw,
    }

    const folderName = buildNoteFolderName(note, item.url)
    const noteTitle = String(note.title ?? folderName)
    const noteId = String(note.noteId ?? extractNoteId(item.url))
    const exportDir = join(exportRoot, folderName)
    const downloadDir = join(downloadRoot, folderName)
    ensureDir(exportDir)
    ensureDir(downloadDir)

    if (itemOptions.exportText) {
      jobs.push({
        label: `${noteTitle} / 文本`,
        filePath: join(exportDir, 'note.txt'),
        currentUrl: item.url,
        currentTitle: noteTitle,
        run: async () => {
          writeFileSync(join(exportDir, 'note.txt'), buildTextContent(note, item.url), 'utf-8')
        },
      })
    }

    if (itemOptions.exportRaw && item.archive?.rawJson) {
      jobs.push({
        label: `${noteTitle} / 原始JSON`,
        filePath: join(exportDir, 'raw.json'),
        currentUrl: item.url,
        currentTitle: noteTitle,
        run: async () => {
          writeFileSync(join(exportDir, 'raw.json'), JSON.stringify(item.archive?.rawJson ?? {}, null, 2), 'utf-8')
        },
      })
    }

    if (itemOptions.downloadImages && isImageNote(note)) {
      const imageList = Array.isArray(note.imageList) ? note.imageList : []
      imageList.forEach((imageUrl, index) => {
        const url = String(imageUrl ?? '')
        if (!url) {
          return
        }
        const ext = url.includes('.png') ? 'png' : url.includes('.webp') ? 'webp' : 'jpg'
        const mediaPath = join(downloadDir, 'media', `image_${index + 1}.${ext}`)
        jobs.push({
          label: `${noteTitle} / 图片 ${index + 1}`,
          filePath: mediaPath,
          currentUrl: item.url,
          currentTitle: noteTitle,
          run: async () => downloadToFile(url, mediaPath, (progress) => {
            jobProgress.set(mediaPath, progress)
            emit('running', mediaPath, item.url, noteTitle, `下载图片 ${index + 1}`, progress)
          }),
        })
      })
    }

    if (itemOptions.downloadVideo && isVideoNote(note)) {
      const videoUrl = resolveVideoDownloadUrl(note, item.videoStreamUrl)
      if (videoUrl) {
        const videoPath = join(downloadDir, 'media', 'video.mp4')
        jobs.push({
          label: `${noteTitle} / 视频`,
          filePath: videoPath,
          currentUrl: item.url,
          currentTitle: noteTitle,
          run: async () => downloadToFile(videoUrl, videoPath, (progress) => {
            jobProgress.set(videoPath, progress)
            emit('running', videoPath, item.url, noteTitle, '下载视频', progress)
          }),
        })
      }
      if (String(note.videoCover ?? '')) {
        const coverUrl = String(note.videoCover ?? '')
        const ext = coverUrl.includes('.png') ? 'png' : coverUrl.includes('.webp') ? 'webp' : 'jpg'
        const coverPath = join(downloadDir, 'media', `cover.${ext}`)
        jobs.push({
          label: `${noteTitle} / 封面`,
          filePath: coverPath,
          currentUrl: item.url,
          currentTitle: noteTitle,
          run: async () => downloadToFile(coverUrl, coverPath, (progress) => {
            jobProgress.set(coverPath, progress)
            emit('running', coverPath, item.url, noteTitle, '下载封面', progress)
          }),
        })
      }
    }

    outputItems.push({
      url: item.url,
      title: noteTitle,
      noteId,
      success: true,
      message: 'queued',
      exportDir,
      downloadDir,
    })
  }

  const total = jobs.length
  let completed = 0
  let failed = 0
  const jobProgress = new Map<string, FileProgress>()

  const getOverallPercent = () => {
    if (total === 0) {
      return 100
    }

    const activeFraction = [...jobProgress.values()].reduce((sum, progress) => {
      if (progress.percent === null) {
        return sum
      }
      return sum + (progress.percent / 100)
    }, 0)

    return Math.max(0, Math.min(100, Math.round(((completed + activeFraction) / total) * 100)))
  }

  const emit = (phase: DownloadProgress['phase'], currentFile = '', currentUrl = '', currentTitle = '', message = '', fileProgress?: FileProgress) => {
    const current = fileProgress ?? { downloadedBytes: 0, totalBytes: null, percent: null }
    onProgress({
      jobId,
      phase,
      total,
      completed,
      percent: getOverallPercent(),
      currentFile,
      currentUrl,
      currentTitle,
      message,
      exportRoot,
      downloadRoot,
      currentDownloadedBytes: current.downloadedBytes,
      currentTotalBytes: current.totalBytes,
      currentPercent: current.percent,
    })
  }

  emit('queued', '', '', '', '准备下载')

  if (total > 0) {
      await mapLimit(jobs, options.concurrency, async (job) => {
      try {
        jobProgress.set(job.filePath, { downloadedBytes: 0, totalBytes: null, percent: null })
        emit('running', job.filePath, job.currentUrl, job.currentTitle, `开始 ${job.label}`, jobProgress.get(job.filePath))
        await job.run()
        completed += 1
        jobProgress.set(job.filePath, { downloadedBytes: 0, totalBytes: null, percent: 100 })
        emit('running', job.filePath, job.currentUrl, job.currentTitle, `完成 ${job.label}`, jobProgress.get(job.filePath))
      } catch (error) {
        completed += 1
        failed += 1
        emit('error', job.filePath, job.currentUrl, job.currentTitle, error instanceof Error ? error.message : `失败 ${job.label}`, jobProgress.get(job.filePath))
      }
    })
  }

  emit('finished', '', '', '', '全部完成')

  return {
    jobId,
    success: failed === 0,
    total,
    completed,
    failed,
    exportRoot,
    downloadRoot,
    outputItems,
  } satisfies DownloadSummary
}
