import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Progress, Select, TextArea, Toast, Collapsible } from '@douyinfe/semi-ui'
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
import { StatCard, Card, EmptyState } from '../../components/ui'
import styles from './NoteWorkbench.module.css'

type PreviewItem = DesktopNotePreview & {
  selected: boolean
  downloadImages: boolean
  downloadVideo: boolean
  videoStreamUrl: string
  exportText: boolean
  exportRaw: boolean
  expanded: boolean
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
    expanded: false,
  }
}

function getNoteTitle(item: PreviewItem) {
  const note = item.archive?.normalized
  return note?.title || note?.nickname || item.url
}

function getVideoStreamOptions(item: PreviewItem) {
  const note = item.archive?.normalized
  const streams = note?.videoStreams ?? []
  return streams.map((s) => ({
    label: `${s.videoCodec || 'unknown'} · ${s.width}x${s.height} · ${Math.round(s.avgBitrate / 1000)}kbps${s.defaultStream ? ' · 默认' : ''}`,
    value: s.masterUrl,
  }))
}

export default function NoteWorkbenchPage() {
  const { activeAccount, setActivePage } = useAppStore()

  const [inputText, setInputText] = useState('')
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [parsing, setParsing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadState, setDownloadState] = useState<DesktopDownloadProgress | null>(null)
  const [concurrency, setConcurrency] = useState(4)

  const currentCookies = activeAccount?.cookiesStr ?? ''

  useEffect(() => {
    return window.desktopAPI.tasks.onDownloadProgress((progress) => setDownloadState(progress))
  }, [])

  const stats = useMemo(() => {
    const selected = previewItems.filter((item) => item.selected)
    const ready = selected.filter((item) => item.success && item.archive?.normalized)
    return {
      total: previewItems.length,
      selected: selected.length,
      ready: ready.length,
      videos: ready.filter((item) => item.archive?.normalized?.noteType === '视频').length,
      images: ready.length - ready.filter((item) => item.archive?.normalized?.noteType === '视频').length,
    }
  }, [previewItems])

  const updateItem = (url: string, patch: Partial<PreviewItem>) => {
    setPreviewItems((current) => current.map((item) => (item.url === url ? { ...item, ...patch } : item)))
  }

  const toggleAll = (checked: boolean) => {
    setPreviewItems((current) => current.map((item) => (item.success ? { ...item, selected: checked } : item)))
  }

  const selectOnlyVideo = () => {
    setPreviewItems((current) => current.map((item) => ({ ...item, selected: item.success && item.archive?.normalized?.noteType === '视频' })))
  }

  const selectOnlyImage = () => {
    setPreviewItems((current) => current.map((item) => ({ ...item, selected: item.success && item.archive?.normalized?.noteType !== '视频' })))
  }

  const removeFailed = () => setPreviewItems((current) => current.filter((item) => item.success))
  const clearPreview = () => { setPreviewItems([]); setDownloadState(null) }

  const handleParse = async () => {
    const urls = extractUrls(inputText)
    if (urls.length === 0) { Toast.warning('请先粘贴笔记链接'); return }
    if (!currentCookies) { Toast.error('请先配置账号 Cookie'); return }
    setParsing(true)
    try {
      const previews = await window.desktopAPI.tasks.previewNotes({ urls, cookiesStr: currentCookies })
      setPreviewItems(previews.map(createPreviewItem))
      Toast.success(`已解析 ${previews.length} 条链接`)
    } catch (error) {
      Toast.error(`解析失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setParsing(false) }
  }

  const handleDownload = async () => {
    const selected = previewItems.filter((item) => item.selected && item.success && item.archive?.normalized)
    if (selected.length === 0) { Toast.warning('请先选择要下载的解析结果'); return }
    setDownloading(true)
    try {
      const summary = await window.desktopAPI.tasks.downloadNotes({
        items: selected.map((item) => ({
          url: item.url,
          success: item.success,
          msg: item.msg,
          archive: item.archive,
          downloadImages: item.downloadImages,
          downloadVideo: item.downloadVideo,
          videoStreamUrl: item.videoStreamUrl,
          exportText: item.exportText,
          exportRaw: item.exportRaw,
        })),
        options: { downloadImages: true, downloadVideo: true, exportText: true, exportRaw: false, concurrency },
        cookiesStr: currentCookies,
      })
      Toast.success(summary.success ? '下载完成' : `完成 ${summary.completed}/${summary.total}，失败 ${summary.failed}`)
    } catch (error) {
      Toast.error(`下载失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally { setDownloading(false) }
  }

  const STAT_CONFIG = [
    { key: 'total' as const, label: '总数', color: 'var(--primary-500)' },
    { key: 'selected' as const, label: '已选', color: 'var(--success-500)' },
    { key: 'ready' as const, label: '可下载', color: 'var(--primary-600)' },
    { key: 'videos' as const, label: '视频', color: 'var(--warning-500)' },
    { key: 'images' as const, label: '图文', color: 'var(--primary-400)' },
  ]

  return (
    <div className={styles.root}>
      <div className={styles.mainCol}>
        {/* Banner */}
        <div className={styles.banner}>
          <div className={styles.bannerAccent} />
          <div className={styles.bannerBody}>
            <div style={{ minWidth: 0 }}>
              <div className={styles.bannerLabel}>笔记批量解析</div>
              <h1 className={styles.bannerTitle}>先看预览，再决定下载</h1>
              <p className={styles.bannerDesc}>这里会先解析链接，展示标题、作者、类型和摘要，再按需下载图片、视频、文字或原始数据。</p>
            </div>
            <div className={styles.bannerActions}>
              <Button type="tertiary" onClick={clearPreview} icon={<IconClear />}>清空结果</Button>
              <Button type="primary" onClick={handleParse} loading={parsing} icon={<IconSearch />}>解析预览</Button>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className={styles.inputCard}>
          <TextArea
            value={inputText}
            onChange={(v: string) => setInputText(v)}
            placeholder="https://www.xiaohongshu.com/explore/xxxx\nhttps://www.xiaohongshu.com/explore/yyyy"
            autosize={{ minRows: 5, maxRows: 8 }}
            style={{ borderRadius: 10 }}
          />
          <div className={styles.inputFooter}>
            <span>已识别 {extractUrls(inputText).length} 条链接</span>
            <span className={styles.cookieStatus} style={{ color: currentCookies ? 'var(--success-600)' : 'var(--error-500)' }}>
              <span className={styles.cookieDot} style={{ background: currentCookies ? 'var(--success-500)' : 'var(--error-500)' }} />
              {currentCookies ? 'Cookie 已配置' : '请先配置账号 Cookie'}
            </span>
          </div>
        </div>

        {/* Stats */}
        {previewItems.length > 0 && (
          <div className={styles.statRow}>
            {STAT_CONFIG.map((config) => (
              <StatCard key={config.key} value={stats[config.key]} label={config.label} color={config.color} />
            ))}
          </div>
        )}

        {/* Preview grid */}
        <Card
          header={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>解析结果</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>点击卡片展开详情，勾选后即可下载</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Button size="small" type="tertiary" onClick={() => toggleAll(true)}>全选</Button>
                <Button size="small" type="tertiary" onClick={() => toggleAll(false)}>全不选</Button>
                <Button size="small" type="tertiary" onClick={selectOnlyVideo}>仅视频</Button>
                <Button size="small" type="tertiary" onClick={selectOnlyImage}>仅图文</Button>
                {previewItems.filter((i) => !i.success).length > 0 && (
                  <Button size="small" type="danger" onClick={removeFailed}>移除失败</Button>
                )}
              </div>
            </div>
          }
        >
          {previewItems.length > 0 ? (
            <div className={styles.previewGrid}>
              {previewItems.map((item) => {
                const note = item.archive?.normalized
                const isVideo = note?.noteType === '视频'
                const thumb = note?.videoCover || (Array.isArray(note?.imageList) ? note?.imageList?.[0] : '')
                const streamOptions = isVideo ? getVideoStreamOptions(item) : []

                return (
                  <div
                    key={item.url}
                    className={`${styles.previewCard} ${item.selected ? styles.previewCardSelected : ''}`}
                    onClick={() => updateItem(item.url, { selected: !item.selected })}
                  >
                    <div className={styles.cardThumb}>
                      {thumb ? <img src={thumb} alt="" /> : <div className={styles.cardThumbPlaceholder}>无预览图</div>}
                      {isVideo && <div className={styles.cardVideoBadge}><IconVideo size="small" style={{ color: '#fff', fontSize: 12 }} /></div>}
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTitle}>{getNoteTitle(item)}</div>
                      <div className={styles.cardTags}>
                        {item.success ? <span className={styles.cardTag} style={{ color: 'var(--success-600)', background: 'var(--success-50)' }}>✓ 成功</span> : <span className={styles.cardTag} style={{ color: 'var(--error-500)', background: 'var(--error-50)' }}>✗ 失败</span>}
                        {isVideo && <span className={styles.cardTag}>视频</span>}
                        {note?.nickname && <span className={styles.cardTag}>{note.nickname}</span>}
                        {note?.uploadTime && <span className={styles.cardTag}>{note.uploadTime}</span>}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {item.selected && (
                      <div className={styles.expandedDetail}>
                        <div className={styles.expandedDesc}>{note?.desc || item.msg || '暂无描述'}</div>
                        <div className={styles.expandedChecks}>
                          <Checkbox checked={item.downloadImages} onChange={(e) => { e.stopPropagation(); updateItem(item.url, { downloadImages: Boolean(e.target?.checked ?? false) }) }}>下载图片</Checkbox>
                          <Checkbox checked={item.downloadVideo} onChange={(e) => { e.stopPropagation(); updateItem(item.url, { downloadVideo: Boolean(e.target?.checked ?? false) }) }}>下载视频</Checkbox>
                          <Checkbox checked={item.exportText} onChange={(e) => { e.stopPropagation(); updateItem(item.url, { exportText: Boolean(e.target?.checked ?? false) }) }}>导出文字</Checkbox>
                        </div>
                        {isVideo && streamOptions.length > 0 && (
                          <div className={styles.expandedStream}>
                            <Select
                              value={item.videoStreamUrl || streamOptions[0]?.value}
                              optionList={streamOptions}
                              onChange={(value) => updateItem(item.url, { videoStreamUrl: String(value ?? '') })}
                              style={{ width: '100%' }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<IconSearch style={{ fontSize: 24 }} />}
              title="还没有解析结果"
              description="在上方粘贴小红书笔记链接，点击「解析预览」查看详情"
            />
          )}
        </Card>
      </div>

      {/* Side column */}
      <div className={styles.sideCol}>
        {/* Download settings */}
        <div className={styles.downloadPanel}>
          <div className={styles.downloadPanelTitle}>下载设置</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8, fontWeight: 500 }}>并发数</div>
              <Select value={String(concurrency)} optionList={[1, 2, 3, 4, 6, 8].map((n) => ({ label: String(n), value: String(n) }))} onChange={(v) => setConcurrency(Number(v))} style={{ width: '100%' }} />
            </div>
            <Button type="primary" icon={<IconDownload />} loading={downloading} onClick={handleDownload} disabled={stats.ready === 0} size="large" block>
              开始下载{stats.ready > 0 ? ` (${stats.ready})` : ''}
            </Button>
          </div>
        </div>

        {/* Download status */}
        <div className={styles.statusPanel}>
          <div className={styles.statusHeader}>
            <span className={styles.statusHeaderTitle}>下载状态</span>
            {downloadState?.phase === 'finished' && <IconTickCircle style={{ color: 'var(--success-500)', fontSize: 18 }} />}
            {downloadState?.phase === 'error' && <IconAlertCircle style={{ color: 'var(--error-500)', fontSize: 18 }} />}
            {downloadState?.phase === 'running' && <IconClock style={{ color: 'var(--primary-500)', fontSize: 18 }} />}
          </div>
          {downloadState ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={`${styles.statusBox} ${downloadState.phase === 'finished' ? styles.statusBoxSuccess : downloadState.phase === 'error' ? styles.statusBoxError : styles.statusBoxRunning}`}>
                <div>{downloadState.message}</div>
              </div>
              <Progress percent={downloadState.percent} showInfo />
              <div className={styles.statusMeta}>
                {downloadState.currentTitle && <div className={styles.statusMetaRow}><span className={styles.statusMetaLabel}>当前：</span><span className={styles.statusMetaValue}>{downloadState.currentTitle}</span></div>}
                {downloadState.currentFile && <div className={styles.statusMetaRow}><span className={styles.statusMetaLabel}>文件：</span><span className={styles.statusMetaValue}>{downloadState.currentFile}</span></div>}
                {downloadState.exportRoot && <div className={styles.statusMetaRow}><span className={styles.statusMetaLabel}>导出：</span><span className={styles.statusMetaValue}>{downloadState.exportRoot}</span></div>}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              <IconClock style={{ fontSize: 24, color: 'var(--gray-400)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              等待开始解析或下载
            </div>
          )}
        </div>

        {/* Account status */}
        <div className={`${styles.accountWidget} ${activeAccount ? styles.accountReady : styles.accountWarn}`}>
          <div className={styles.accountHeader}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: activeAccount ? 'var(--success-500)' : 'var(--warning-500)', flexShrink: 0 }} />
            {activeAccount ? '账号已就绪' : '未设置账号'}
          </div>
          <div className={styles.accountText}>
            {activeAccount ? `当前使用：${activeAccount.name}` : '请先配置账号 Cookie，再进行笔记解析和下载。'}
          </div>
          {!activeAccount && (
            <Button type="primary" size="small" style={{ marginTop: 10 }} onClick={() => setActivePage('settings')}>去设置</Button>
          )}
        </div>
      </div>
    </div>
  )
}
