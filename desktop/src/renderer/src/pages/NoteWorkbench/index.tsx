import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Select, Tag, TextArea, Toast } from '@douyinfe/semi-ui'
import {
  IconClear,
  IconDownload,
  IconSearch,
  IconVideo,
  IconTickCircle,
  IconAlertCircle,
  IconClock,
} from '@douyinfe/semi-icons'
import { useAppStore } from '../../stores/appStore'

type PreviewItem = DesktopNotePreview & {
  selected: boolean
  downloadImages: boolean
  downloadVideo: boolean
  videoStreamUrl: string
  exportText: boolean
  exportRaw: boolean
  showRaw: boolean
}

const DEFAULT_DOWNLOAD = {
  downloadImages: true,
  downloadVideo: true,
  exportText: true,
  exportRaw: false,
  concurrency: 4,
}

function extractUrls(text: string) {
  return [...new Set((text.match(/https?:\/\/[^\s]+/g) ?? []).map((item) => item.trim()).filter(Boolean))]
}

function createPreviewItem(preview: DesktopNotePreview): PreviewItem {
  const note = preview.archive?.normalized
  const isVideo = note?.noteType === '视频'
  const videoStreamUrl = note?.videoAddr ?? note?.videoStreams?.[0]?.masterUrl ?? ''

  return {
    ...preview,
    selected: Boolean(preview.success && note),
    downloadImages: !isVideo,
    downloadVideo: isVideo,
    videoStreamUrl,
    exportText: true,
    exportRaw: false,
    showRaw: false,
  }
}

function getVideoStreamLabel(stream: StandardVideoStream) {
  const resolution = stream.width && stream.height ? `${stream.width}x${stream.height}` : '未知分辨率'
  const bitrate = stream.avgBitrate ? `${Math.round(stream.avgBitrate / 1000)}kbps` : '未知码率'
  const codec = stream.videoCodec || stream.codec || 'unknown'
  return `${codec} · ${resolution} · ${bitrate}${stream.defaultStream ? ' · 默认' : ''}`
}

function getVideoStreamOptions(note?: StandardNote | null) {
  const streams = note?.videoStreams ?? []
  const baseOptions = streams.map((stream) => ({ label: getVideoStreamLabel(stream), value: stream.masterUrl }))
  if (baseOptions.length > 0) {
    return baseOptions
  }

  const fallbackUrl = note?.videoAddr ?? ''
  return fallbackUrl ? [{ label: '默认流', value: fallbackUrl }] : []
}

function getNoteTitle(item: PreviewItem) {
  const note = item.archive?.normalized
  return note?.title || note?.nickname || item.url
}

function getNoteSnippet(item: PreviewItem) {
  const note = item.archive?.normalized
  return note?.desc || item.msg || '暂无描述'
}

const STAT_CONFIG = [
  { key: 'total', label: '总数', color: 'var(--primary-500)', bg: 'var(--primary-50)', dotBg: 'var(--primary-500)' },
  { key: 'selected', label: '已选', color: 'var(--success-500)', bg: 'var(--success-50)', dotBg: 'var(--success-500)' },
  { key: 'ready', label: '可下载', color: 'var(--primary-600)', bg: 'var(--primary-50)', dotBg: 'var(--primary-400)' },
  { key: 'videos', label: '视频', color: 'var(--warning-500)', bg: 'var(--warning-50)', dotBg: 'var(--warning-500)' },
  { key: 'images', label: '图片', color: 'var(--primary-400)', bg: 'var(--primary-50)', dotBg: 'var(--primary-300)' },
] as const

export default function NoteWorkbenchPage() {
  const { activeAccount, setActivePage } = useAppStore()

  const [inputText, setInputText] = useState('')
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [parsing, setParsing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadState, setDownloadState] = useState<DesktopDownloadProgress | null>(null)
  const [downloadOptions, setDownloadOptions] = useState(DEFAULT_DOWNLOAD)

  const currentCookies = activeAccount?.cookiesStr ?? ''

  useEffect(() => {
    return window.desktopAPI.tasks.onDownloadProgress((progress) => {
      setDownloadState(progress)
    })
  }, [])

  const stats = useMemo(() => {
    const selected = previewItems.filter((item) => item.selected)
    const ready = selected.filter((item) => item.success && item.archive?.normalized)
    const videos = ready.filter((item) => item.archive?.normalized?.noteType === '视频').length
    return {
      total: previewItems.length,
      selected: selected.length,
      ready: ready.length,
      videos,
      images: ready.length - videos,
      failed: previewItems.filter((item) => !item.success).length,
    }
  }, [previewItems])

  const updateItem = (url: string, patch: Partial<PreviewItem>) => {
    setPreviewItems((current) => current.map((item) => (item.url === url ? { ...item, ...patch } : item)))
  }

  const toggleAll = (checked: boolean) => {
    setPreviewItems((current) => current.map((item) => (item.success ? { ...item, selected: checked } : item)))
  }

  const selectOnlyVideo = () => {
    setPreviewItems((current) =>
      current.map((item) => ({
        ...item,
        selected: item.success && item.archive?.normalized?.noteType === '视频',
      })),
    )
  }

  const selectOnlyImage = () => {
    setPreviewItems((current) =>
      current.map((item) => ({
        ...item,
        selected: item.success && item.archive?.normalized?.noteType !== '视频',
      })),
    )
  }

  const clearPreview = () => {
    setPreviewItems([])
    setDownloadState(null)
  }

  const removeFailed = () => {
    setPreviewItems((current) => current.filter((item) => item.success))
  }

  const handleParse = async () => {
    const urls = extractUrls(inputText)
    if (urls.length === 0) {
      Toast.warning('请先粘贴一个或多个笔记链接')
      return
    }
    if (!currentCookies) {
      Toast.error('请先配置账号 Cookie')
      return
    }

    setParsing(true)
    try {
      const previews = await window.desktopAPI.tasks.previewNotes({
        urls,
        cookiesStr: currentCookies,
      })
      setPreviewItems(previews.map(createPreviewItem))
      Toast.success(`已解析 ${previews.length} 条链接`)
    } catch (error) {
      Toast.error(`解析失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setParsing(false)
    }
  }

  const handleDownload = async () => {
    const selected = previewItems.filter((item) => item.selected && item.success && item.archive?.normalized)
    if (selected.length === 0) {
      Toast.warning('请先选择要下载的解析结果')
      return
    }

    setDownloading(true)
    try {
        const summary = await window.desktopAPI.tasks.downloadNotes({
          items: selected.map((item) => ({
            ...item,
            downloadImages: item.downloadImages,
            downloadVideo: item.downloadVideo,
            videoStreamUrl: item.videoStreamUrl,
            exportText: item.exportText,
            exportRaw: item.exportRaw,
          })),
        options: {
          downloadImages: downloadOptions.downloadImages,
          downloadVideo: downloadOptions.downloadVideo,
          exportText: downloadOptions.exportText,
          exportRaw: downloadOptions.exportRaw,
          concurrency: downloadOptions.concurrency,
        },
        cookiesStr: currentCookies,
      })

      setDownloadState((current) =>
        current
          ? {
              ...current,
              phase: summary.success ? 'finished' : 'error',
              total: summary.total,
              completed: summary.completed,
              percent: summary.total === 0 ? 100 : Math.round((summary.completed / summary.total) * 100),
              message: summary.success ? '下载完成' : '部分失败',
              exportRoot: summary.exportRoot,
              downloadRoot: summary.downloadRoot,
            }
          : current,
      )

      Toast.success(summary.success ? '下载完成' : `完成 ${summary.completed}/${summary.total}，失败 ${summary.failed}`)
    } catch (error) {
      Toast.error(`下载失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setDownloading(false)
    }
  }

  const openSettings = () => setActivePage('settings')

  const getDownloadPhaseIcon = () => {
    if (!downloadState) return null
    if (downloadState.phase === 'finished') return <IconTickCircle style={{ color: 'var(--success-500)', fontSize: 18 }} />
    if (downloadState.phase === 'error') return <IconAlertCircle style={{ color: 'var(--error-500)', fontSize: 18 }} />
    return <IconClock style={{ color: 'var(--primary-500)', fontSize: 18 }} />
  }

  const getDownloadPhaseColor = () => {
    if (!downloadState) return 'var(--primary-500)'
    if (downloadState.phase === 'finished') return 'var(--success-500)'
    if (downloadState.phase === 'error') return 'var(--error-500)'
    return 'var(--primary-500)'
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 20, maxWidth: 1440 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          padding: 0,
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex' }}>
            <div style={{
              width: 4,
              background: 'linear-gradient(180deg, var(--primary-400), var(--primary-600))',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 8, fontWeight: 500, letterSpacing: '0.3px' }}>
                  笔记批量解析
                </div>
                <h1 style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, var(--primary-600), var(--primary-400))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  先看预览，再决定下载
                </h1>
                <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--color-text-tertiary)', maxWidth: 640, lineHeight: 1.6 }}>
                  这里会先解析链接，展示标题、作者、类型和摘要，再按需下载图片、视频、文字或原始数据。
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                <Button type="tertiary" onClick={clearPreview} icon={<IconClear />}>
                  清空结果
                </Button>
                <Button
                  type="primary"
                  onClick={handleParse}
                  loading={parsing}
                  icon={<IconSearch />}
                >
                  解析预览
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          padding: 16,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <TextArea
            value={inputText}
            onChange={(value: string) => setInputText(value)}
            placeholder={'https://www.xiaohongshu.com/explore/xxxx\nhttps://www.xiaohongshu.com/explore/yyyy'}
            autosize={{ minRows: 6, maxRows: 10 }}
            style={{ borderRadius: 10 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            <span>已识别 {extractUrls(inputText).length} 条链接</span>
            <span style={{
              color: currentCookies ? 'var(--success-600)' : 'var(--error-500)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: currentCookies ? 'var(--success-500)' : 'var(--error-500)',
                display: 'inline-block',
              }} />
              {currentCookies ? 'Cookie 已配置' : '请先配置账号 Cookie'}
            </span>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
          {STAT_CONFIG.map((config) => {
            const value = stats[config.key]
            return (
              <div
                key={config.key}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 14,
                  padding: 14,
                  transition: 'all 0.15s ease',
                  cursor: 'default',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                  e.currentTarget.style.borderColor = config.dotBg
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: `linear-gradient(90deg, ${config.dotBg}, transparent)`,
                  borderRadius: '14px 14px 0 0',
                }} />
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{config.label}</div>
                <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: config.color }}>{value}</div>
              </div>
            )
          })}
        </section>

        <section style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>解析结果</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>可以单独预览、勾选、改下载选项</div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button size="small" type="tertiary" onClick={() => toggleAll(true)}>
                全选
              </Button>
              <Button size="small" type="tertiary" onClick={() => toggleAll(false)}>
                全不选
              </Button>
              <Button size="small" type="tertiary" onClick={selectOnlyVideo}>
                仅视频
              </Button>
              <Button size="small" type="tertiary" onClick={selectOnlyImage}>
                仅图片
              </Button>
              {stats.failed > 0 && (
                <Button size="small" type="danger" onClick={removeFailed}>
                  移除失败
                </Button>
              )}
            </div>
          </div>

          {previewItems.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {previewItems.map((item) => {
                const note = item.archive?.normalized
                const isVideo = note?.noteType === '视频'
                const thumb = note?.videoCover || (Array.isArray(note?.imageList) ? note?.imageList?.[0] : '')
                const streamOptions = getVideoStreamOptions(note)
                const selectedStream = streamOptions.find((option) => option.value === item.videoStreamUrl)

                return (
                  <div
                    key={item.url}
                    style={{
                      padding: 16,
                      borderBottom: '1px solid var(--color-border)',
                      background: item.selected ? 'var(--primary-50)' : 'transparent',
                      borderLeft: item.selected ? '3px solid var(--primary-500)' : '3px solid transparent',
                      transition: 'all 0.15s ease',
                      cursor: 'default',
                    }}
                    onMouseEnter={(e) => {
                      if (!item.selected) {
                        e.currentTarget.style.background = 'var(--color-surface-hover)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!item.selected) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <Checkbox
                        checked={item.selected}
                        onChange={(e) => updateItem(item.url, { selected: Boolean(e.target.checked) })}
                        style={{ marginTop: 6, flexShrink: 0 }}
                      />

                      <div style={{
                        width: 120,
                        height: 90,
                        borderRadius: 10,
                        background: 'var(--gray-100)',
                        border: '1px solid var(--color-border)',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                      }}>
                        {thumb ? (
                          <img src={thumb} alt={getNoteTitle(item)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>无预览图</div>
                        )}
                        {isVideo && (
                          <div style={{
                            position: 'absolute',
                            bottom: 6,
                            right: 6,
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: 'rgba(0, 0, 0, 0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <IconVideo size="small" style={{ color: '#fff', fontSize: 12 }} />
                          </div>
                        )}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {getNoteTitle(item)}
                          </div>
                          <Tag size="small" color={item.success ? 'green' : 'red'}>
                            {item.success ? '解析成功' : '解析失败'}
                          </Tag>
                          {isVideo && <Tag size="small" color="blue">视频</Tag>}
                          {!isVideo && note && <Tag size="small" color="cyan">图文</Tag>}
                        </div>

                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-quaternary)', wordBreak: 'break-all' }}>
                          {item.url}
                        </div>

                        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                          {getNoteSnippet(item)}
                        </div>

                        {note && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                            <Tag size="small">{note.nickname || '未知作者'}</Tag>
                            <Tag size="small">{note.uploadTime || '未知时间'}</Tag>
                            <Tag size="small">赞 {note.likedCount ?? 0}</Tag>
                            <Tag size="small">评 {note.commentCount ?? 0}</Tag>
                            <Tag size="small">藏 {note.collectedCount ?? 0}</Tag>
                            {isVideo && <Tag size="small">流 {note.videoStreams?.length ?? 0}</Tag>}
                          </div>
                        )}

                        {isVideo && streamOptions.length > 0 && (
                          <div style={{
                            marginTop: 12,
                            padding: 10,
                            borderRadius: 10,
                            background: 'var(--gray-50)',
                            border: '1px solid var(--color-border)',
                          }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6, fontWeight: 500 }}>选择下载流</div>
                            <Select
                              value={item.videoStreamUrl || streamOptions[0]?.value}
                              optionList={streamOptions}
                              onChange={(value) => updateItem(item.url, { videoStreamUrl: String(value ?? '') })}
                              style={{ width: '100%' }}
                            />
                            {selectedStream && (
                              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)', wordBreak: 'break-all' }}>
                                当前：{selectedStream.label}
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                          <Button size="small" type="tertiary" onClick={() => updateItem(item.url, { showRaw: !item.showRaw })}>
                            {item.showRaw ? '收起原始数据' : '查看原始数据'}
                          </Button>
                        </div>

                        {item.showRaw && (
                          <div style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 10,
                            background: 'var(--gray-100)',
                            border: '1px solid var(--color-border)',
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: 'var(--color-text-secondary)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            fontFamily: 'monospace',
                          }}>
                            {item.archive?.rawText || JSON.stringify(item.archive?.rawJson ?? item.archive?.normalized ?? {}, null, 2)}
                          </div>
                        )}
                      </div>

                      <div style={{ minWidth: 190, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {item.success ? (
                          <>
                            <Checkbox checked={item.downloadImages} onChange={(e) => updateItem(item.url, { downloadImages: Boolean(e.target.checked) })}>
                              下载图片
                            </Checkbox>
                            <Checkbox checked={item.downloadVideo} onChange={(e) => updateItem(item.url, { downloadVideo: Boolean(e.target.checked) })}>
                              下载视频
                            </Checkbox>
                            <Checkbox checked={item.exportText} onChange={(e) => updateItem(item.url, { exportText: Boolean(e.target.checked) })}>
                              导出文字
                            </Checkbox>
                            <Checkbox checked={item.exportRaw} onChange={(e) => updateItem(item.url, { exportRaw: Boolean(e.target.checked) })}>
                              导出原始 JSON
                            </Checkbox>
                          </>
                        ) : (
                          <div style={{
                            fontSize: 12,
                            color: 'var(--error-500)',
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'var(--error-50)',
                            border: '1px solid var(--error-100)',
                          }}>
                            {item.msg || '解析失败'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              color: 'var(--color-text-tertiary)',
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}>
                <IconSearch style={{ fontSize: 24, color: 'var(--gray-400)' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
                还没有解析结果
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.6, maxWidth: 320 }}>
                在上方粘贴小红书笔记链接，点击「解析预览」查看详情
              </div>
            </div>
          )}
        </section>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          padding: 16,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>下载设置</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8, fontWeight: 500 }}>并发数</div>
              <Select
                value={String(downloadOptions.concurrency)}
                optionList={[
                  { label: '1', value: '1' },
                  { label: '2', value: '2' },
                  { label: '3', value: '3' },
                  { label: '4', value: '4' },
                  { label: '6', value: '6' },
                  { label: '8', value: '8' },
                ]}
                onChange={(value) => setDownloadOptions((prev) => ({ ...prev, concurrency: Number(value) }))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Checkbox checked={downloadOptions.downloadImages} onChange={(e) => setDownloadOptions((prev) => ({ ...prev, downloadImages: Boolean(e.target.checked) }))}>
                图片
              </Checkbox>
              <Checkbox checked={downloadOptions.downloadVideo} onChange={(e) => setDownloadOptions((prev) => ({ ...prev, downloadVideo: Boolean(e.target.checked) }))}>
                视频
              </Checkbox>
              <Checkbox checked={downloadOptions.exportText} onChange={(e) => setDownloadOptions((prev) => ({ ...prev, exportText: Boolean(e.target.checked) }))}>
                文本
              </Checkbox>
              <Checkbox checked={downloadOptions.exportRaw} onChange={(e) => setDownloadOptions((prev) => ({ ...prev, exportRaw: Boolean(e.target.checked) }))}>
                原始 JSON
              </Checkbox>
            </div>

            <div style={{
              borderTop: '1px solid var(--color-border)',
              paddingTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>快捷选择</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="small" type="tertiary" onClick={() => toggleAll(true)} style={{ flex: 1 }}>
                  全选
                </Button>
                <Button size="small" type="tertiary" onClick={() => toggleAll(false)} style={{ flex: 1 }}>
                  全不选
                </Button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="small" type="tertiary" onClick={selectOnlyVideo} style={{ flex: 1 }}>
                  仅视频
                </Button>
                <Button size="small" type="tertiary" onClick={selectOnlyImage} style={{ flex: 1 }}>
                  仅图片
                </Button>
              </div>
              {stats.failed > 0 && (
                <Button size="small" type="danger" block onClick={removeFailed}>
                  移除失败项
                </Button>
              )}
            </div>

            <Button
              type="primary"
              icon={<IconDownload />}
              loading={downloading}
              onClick={handleDownload}
              disabled={stats.ready === 0}
              size="large"
              block
              style={{
                marginTop: 4,
              }}
            >
              开始下载{stats.ready > 0 ? ` (${stats.ready})` : ''}
            </Button>
          </div>
        </section>

        <section style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          padding: 16,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>下载状态</div>
            {downloadState && getDownloadPhaseIcon()}
          </div>
          {downloadState ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: downloadState.phase === 'finished'
                  ? 'var(--success-50)'
                  : downloadState.phase === 'error'
                    ? 'var(--error-50)'
                    : 'var(--primary-50)',
                border: `1px solid ${
                  downloadState.phase === 'finished'
                    ? 'var(--success-100)'
                    : downloadState.phase === 'error'
                      ? 'var(--error-100)'
                      : 'var(--primary-100)'
                }`,
              }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: getDownloadPhaseColor(),
                  marginBottom: 4,
                }}>
                  {downloadState.message}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  任务 {downloadState.jobId}
                </div>
              </div>

              <div style={{ width: '100%' }}>
                <div style={{
                  width: '100%',
                  height: 8,
                  background: 'var(--gray-200)',
                  borderRadius: 9999,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${downloadState.percent}%`,
                    borderRadius: 9999,
                    background: downloadState.phase === 'finished'
                      ? 'linear-gradient(90deg, var(--success-500), var(--success-600))'
                      : downloadState.phase === 'error'
                        ? 'linear-gradient(90deg, var(--error-500), var(--error-600))'
                        : 'linear-gradient(90deg, var(--primary-500), var(--primary-400))',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  <span>进度 {downloadState.completed}/{downloadState.total}</span>
                  <span style={{ fontWeight: 600, color: getDownloadPhaseColor() }}>{downloadState.percent}%</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {downloadState.currentTitle && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ flexShrink: 0, color: 'var(--color-text-quaternary)' }}>当前：</span>
                    <span style={{ wordBreak: 'break-all' }}>{downloadState.currentTitle}</span>
                  </div>
                )}
                {downloadState.currentFile && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ flexShrink: 0, color: 'var(--color-text-quaternary)' }}>文件：</span>
                    <span style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11 }}>{downloadState.currentFile}</span>
                  </div>
                )}
                {downloadState.exportRoot && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ flexShrink: 0, color: 'var(--color-text-quaternary)' }}>导出：</span>
                    <span style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11 }}>{downloadState.exportRoot}</span>
                  </div>
                )}
                {downloadState.downloadRoot && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ flexShrink: 0, color: 'var(--color-text-quaternary)' }}>下载：</span>
                    <span style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11 }}>{downloadState.downloadRoot}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '20px 0',
              color: 'var(--color-text-tertiary)',
            }}>
              <IconClock style={{ fontSize: 24, color: 'var(--gray-400)', marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>等待开始解析或下载</div>
            </div>
          )}
        </section>

        <section style={{
          background: activeAccount ? 'var(--success-50)' : 'var(--warning-50)',
          border: `1px solid ${activeAccount ? 'var(--success-100)' : 'var(--warning-100)'}`,
          borderRadius: 16,
          padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: activeAccount ? 'var(--success-500)' : 'var(--warning-500)',
              flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {activeAccount ? '账号已就绪' : '未设置账号'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            {activeAccount
              ? `当前使用：${activeAccount.name}`
              : '请先配置账号 Cookie，再进行笔记解析和下载。'}
          </div>
          {!activeAccount && (
            <Button type="primary" size="small" style={{ marginTop: 10 }} onClick={openSettings}>
              去设置
            </Button>
          )}
        </section>
      </div>
    </div>
  )
}
