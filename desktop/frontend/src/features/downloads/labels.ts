import { DownloadState, ItemState, MediaKind } from '@/shared/contracts';
export const states: Record<DownloadState, { label: string; color?: string }> = {
  [DownloadState.Unknown]: { label: '未知' },
  [DownloadState.Queued]: { label: '排队中', color: 'blue' },
  [DownloadState.Resolving]: { label: '准备中', color: 'blue' },
  [DownloadState.Running]: { label: '下载中', color: 'processing' },
  [DownloadState.Paused]: { label: '已暂停' },
  [DownloadState.WaitingRetry]: { label: '等待重试', color: 'orange' },
  [DownloadState.Succeeded]: { label: '已完成', color: 'success' },
  [DownloadState.Partial]: { label: '部分完成', color: 'warning' },
  [DownloadState.Failed]: { label: '失败', color: 'error' },
  [DownloadState.Canceled]: { label: '已取消' },
  [DownloadState.Interrupted]: { label: '已中断', color: 'warning' },
};
export const itemLabels: Record<ItemState, string> = {
  [ItemState.ItemUnknown]: '未知',
  [ItemState.ItemPending]: '待下载',
  [ItemState.ItemRunning]: '下载中',
  [ItemState.ItemPaused]: '已暂停',
  [ItemState.ItemWaitingRetry]: '等待重试',
  [ItemState.ItemSucceeded]: '成功',
  [ItemState.ItemSkipped]: '已跳过',
  [ItemState.ItemFailed]: '失败',
  [ItemState.ItemCanceled]: '未完成',
  [ItemState.ItemFinalizing]: '保存中',
  [ItemState.ItemInterrupted]: '已中断',
};
export const mediaLabels: Record<MediaKind, string> = {
  [MediaKind.MediaUnknown]: '未知',
  [MediaKind.MediaVideo]: '主视频',
  [MediaKind.MediaImage]: '图片',
  [MediaKind.MediaMotion]: 'LivePhoto 视频',
  [MediaKind.MediaPretty]: '笔记 JSON',
  [MediaKind.MediaText]: '笔记文本',
  [MediaKind.MediaRaw]: '原始响应',
  [MediaKind.MediaManifest]: '结果清单',
};
