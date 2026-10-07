import { CollectionState, CollectionItemState, SourceState } from '@/shared/contracts';
export const collectionStates: Record<CollectionState, { label: string; color?: string }> = {
  [CollectionState.StateUnknown]: { label: '未知' },
  [CollectionState.Queued]: { label: '排队中', color: 'blue' },
  [CollectionState.Running]: { label: '解析中', color: 'processing' },
  [CollectionState.Succeeded]: { label: '已完成', color: 'success' },
  [CollectionState.Partial]: { label: '部分完成', color: 'warning' },
  [CollectionState.Failed]: { label: '失败', color: 'error' },
  [CollectionState.Paused]: { label: '已暂停' },
  [CollectionState.Canceled]: { label: '已取消' },
  [CollectionState.Interrupted]: { label: '已中断', color: 'warning' },
  [CollectionState.Limited]: { label: '达到上限', color: 'warning' },
};
export const collectionItemLabels: Record<CollectionItemState, string> = {
  [CollectionItemState.ItemUnknown]: '未知',
  [CollectionItemState.Pending]: '等待解析',
  [CollectionItemState.Resolving]: '解析中',
  [CollectionItemState.Complete]: '已解析',
  [CollectionItemState.ItemFailed]: '失败',
  [CollectionItemState.Skipped]: '已筛除/跳过',
  [CollectionItemState.Incomplete]: '有字段警告',
  [CollectionItemState.ItemInterrupted]: '已中断',
  [CollectionItemState.ItemCanceled]: '已取消',
};
export const sourceLabels: Record<SourceState, string> = {
  [SourceState.SourceUnknown]: '未知',
  [SourceState.SourcePending]: '等待发现',
  [SourceState.SourceRunning]: '分页中',
  [SourceState.SourceComplete]: '已发现完毕',
  [SourceState.SourceFailed]: '失败',
  [SourceState.SourceLimited]: '达到上限',
};
export const collectionActive = (state: CollectionState) =>
  state === CollectionState.Queued || state === CollectionState.Running;
