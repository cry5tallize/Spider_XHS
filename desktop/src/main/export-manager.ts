import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getProjectDataPath } from './data-path'
import type { AppSettings } from './settings-store'
import type { TaskRun } from './task-manager'

type ExportProgress = {
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

type FileProgress = {
  downloadedBytes: number
  totalBytes: number | null
  percent: number | null
}

type ExportResult = {
  success: boolean
  msg: string
  exportPath: string
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'task'
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

function getExportRoot(settings: AppSettings) {
  return settings.defaultExportDir?.trim() || getProjectDataPath('exports')
}

function getDownloadRoot(settings: AppSettings) {
  return settings.defaultDownloadDir?.trim() || getProjectDataPath('downloads')
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

function resolveVideoUrl(note: Record<string, unknown>, videoStreamUrl?: string) {
  const chosen = videoStreamUrl?.trim()
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

async function exportNoteMedia(
  note: Record<string, unknown>,
  mediaDir: string,
  videoStreamUrl: string | undefined,
  emit: (currentFile: string, currentUrl: string, currentTitle: string, message: string, fileProgress?: FileProgress) => void,
  noteTitle: string,
  noteUrl: string,
  markCompleted: () => number,
) {
  const imageList = Array.isArray(note.imageList) ? note.imageList : []
  ensureDir(mediaDir)

  for (let index = 0; index < imageList.length; index += 1) {
    const imageUrl = String(imageList[index] ?? '')
    if (!imageUrl) {
      continue
    }
    const ext = imageUrl.includes('.png') ? 'png' : imageUrl.includes('.webp') ? 'webp' : 'jpg'
    const filePath = join(mediaDir, `image_${index + 1}.${ext}`)
    await downloadToFile(imageUrl, filePath, (progress) => emit(filePath, noteUrl, noteTitle, `下载图片 ${index + 1}`, progress))
    markCompleted()
  }

  const videoAddr = resolveVideoUrl(note, videoStreamUrl)
  if (videoAddr) {
    const filePath = join(mediaDir, 'video.mp4')
    await downloadToFile(videoAddr, filePath, (progress) => emit(filePath, noteUrl, noteTitle, '下载视频', progress))
    markCompleted()
  }

  const videoCover = String(note.videoCover ?? '')
  if (videoCover) {
    const ext = videoCover.includes('.png') ? 'png' : videoCover.includes('.webp') ? 'webp' : 'jpg'
    const filePath = join(mediaDir, `cover.${ext}`)
    await downloadToFile(videoCover, filePath, (progress) => emit(filePath, noteUrl, noteTitle, '下载封面', progress))
    markCompleted()
  }
}

function countNoteMediaFiles(note: Record<string, unknown>) {
  const imageCount = Array.isArray(note.imageList) ? note.imageList.filter(Boolean).length : 0
  const videoCount = resolveVideoUrl(note) ? 1 : 0
  const coverCount = String(note.videoCover ?? '') ? 1 : 0
  return imageCount + videoCount + coverCount
}

function countExportFiles(normalizedResult: Record<string, unknown> | null) {
  if (!normalizedResult) {
    return 0
  }

  const normalized = normalizedResult.normalized as Record<string, unknown> | null
  if (!normalized) {
    return 0
  }

  if (Array.isArray(normalized.noteList)) {
    const noteList = normalized.noteList as Record<string, unknown>[]
    return 1 + noteList.length + noteList.reduce((sum, note) => sum + countNoteMediaFiles(note), 0)
  }

  if (Array.isArray(normalized.userList)) {
    return 1
  }

  if (Array.isArray(normalized.subComments) || Array.isArray(normalized.pictures) || normalized.commentId) {
    return 1
  }

  if (normalized.noteId || normalized.userId) {
    return 1 + (normalized.noteId ? countNoteMediaFiles(normalized) : 0)
  }

  return 1
}

async function exportNormalizedData(
  normalizedResult: Record<string, unknown> | null,
  parsedDir: string,
  mediaDir: string,
  videoStreamUrl: string | undefined,
  emit: (progress: ExportProgress) => void,
  jobId: string,
  exportRoot: string,
  downloadRoot: string,
  completed: () => number,
  markCompleted: () => number,
  total: number,
  noteProgressFile?: string,
  noteProgressUrl?: string,
  noteProgressTitle?: string,
) {
  if (!normalizedResult) {
    return
  }

  const normalized = normalizedResult.normalized as Record<string, unknown> | null
  if (!normalized) {
    return
  }

  if (Array.isArray(normalized.noteList)) {
    writeFileSync(join(parsedDir, 'notes.json'), JSON.stringify(normalized.noteList, null, 2), 'utf-8')
    markCompleted()
    emit({ jobId, phase: 'running', total, completed: completed(), percent: total === 0 ? 100 : Math.round((completed() / total) * 100), currentFile: '', currentUrl: '', currentTitle: '', message: '导出 notes.json', exportRoot, downloadRoot, currentDownloadedBytes: 0, currentTotalBytes: null, currentPercent: null })
    for (const note of normalized.noteList as Record<string, unknown>[]) {
      const noteDir = join(parsedDir, 'notes', sanitizeFileName(String(note.noteId ?? note.title ?? 'note')))
      ensureDir(noteDir)
      writeFileSync(join(noteDir, 'detail.json'), JSON.stringify(note, null, 2), 'utf-8')
      markCompleted()
      emit({ jobId, phase: 'running', total, completed: completed(), percent: total === 0 ? 100 : Math.round((completed() / total) * 100), currentFile: '', currentUrl: '', currentTitle: '', message: '导出 detail.json', exportRoot, downloadRoot, currentDownloadedBytes: 0, currentTotalBytes: null, currentPercent: null })
      const noteTitle = String(note.title ?? note.nickname ?? 'note')
      const noteUrl = String(note.noteUrl ?? '')
      await exportNoteMedia(note, join(noteDir, 'media'), videoStreamUrl, (currentFile, currentUrl, currentTitle, message, fileProgress) => {
        const current = fileProgress ?? { downloadedBytes: 0, totalBytes: null, percent: null }
        emit({
          jobId,
          phase: 'running',
          total,
          completed: completed(),
          percent: total === 0 ? 100 : Math.round(((completed() + ((current.percent ?? 0) / 100)) / total) * 100),
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
      }, noteTitle, noteUrl, markCompleted)
    }
    return
  }

  if (Array.isArray(normalized.userList)) {
    writeFileSync(join(parsedDir, 'users.json'), JSON.stringify(normalized.userList, null, 2), 'utf-8')
    return
  }

  if (Array.isArray(normalized.subComments) || Array.isArray(normalized.pictures) || normalized.commentId) {
    writeFileSync(join(parsedDir, 'comment.json'), JSON.stringify(normalized, null, 2), 'utf-8')
    return
  }

  if (normalized.noteId || normalized.userId) {
    writeFileSync(join(parsedDir, 'detail.json'), JSON.stringify(normalized, null, 2), 'utf-8')
    markCompleted()
    if (normalized.noteId) {
      await exportNoteMedia(normalized, mediaDir, videoStreamUrl, (currentFile, currentUrl, currentTitle, message, fileProgress) => {
        const current = fileProgress ?? { downloadedBytes: 0, totalBytes: null, percent: null }
        emit({
          jobId,
          phase: 'running',
          total,
          completed: completed(),
          percent: total === 0 ? 100 : Math.round(((completed() + ((current.percent ?? 0) / 100)) / total) * 100),
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
      }, String(normalized.title ?? 'note'), String(normalized.noteUrl ?? ''), markCompleted)
    }
    return
  }

  writeFileSync(join(parsedDir, 'result.json'), JSON.stringify(normalized, null, 2), 'utf-8')
}

export async function exportTaskRun(task: TaskRun, settings: AppSettings, options?: { videoStreamUrl?: string }, onProgress?: (progress: ExportProgress) => void): Promise<ExportResult> {
  const rootDir = getExportRoot(settings)
  const downloadRoot = getDownloadRoot(settings)
  const taskDirName = `${sanitizeFileName(task.name)}_${sanitizeFileName(task.id)}`
  const taskDir = join(rootDir, taskDirName)
  const rawDir = join(taskDir, 'raw')
  const parsedDir = join(taskDir, 'parsed')
  const mediaDir = join(downloadRoot, taskDirName, 'media')

  ensureDir(rawDir)
  ensureDir(parsedDir)
  ensureDir(mediaDir)

  writeFileSync(join(taskDir, 'task.json'), JSON.stringify(task, null, 2), 'utf-8')
  if (task.rawResult) {
    writeFileSync(join(rawDir, 'result.json'), JSON.stringify(task.rawResult, null, 2), 'utf-8')
    if (typeof task.rawResult.rawText === 'string') {
      writeFileSync(join(rawDir, 'result.txt'), task.rawResult.rawText, 'utf-8')
    }
  }

  const total = countExportFiles(task.normalizedResult)
  let completed = 0
  const emit = (progress: ExportProgress) => {
    onProgress?.(progress)
  }
  const markCompleted = () => {
    completed += 1
    return completed
  }

  await exportNormalizedData(
    task.normalizedResult,
    parsedDir,
    mediaDir,
    options?.videoStreamUrl,
    emit,
    task.id,
    taskDir,
    downloadRoot,
    () => completed,
    markCompleted,
    total,
  )
  return {
    success: true,
    msg: 'success',
    exportPath: taskDir,
  }
}
