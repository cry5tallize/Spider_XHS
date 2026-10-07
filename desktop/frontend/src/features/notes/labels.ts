import { ParseState, NoteKind } from '@/shared/contracts';

export const parseStates: Record<ParseState, { label: string; color?: string }> = {
  [ParseState.ParseUnknown]: { label: '未知' },
  [ParseState.ParseQueued]: { label: '等待解析', color: 'blue' },
  [ParseState.ParseRunning]: { label: '解析中', color: 'processing' },
  [ParseState.ParseCompleted]: { label: '已解析', color: 'success' },
  [ParseState.ParseFailed]: { label: '失败', color: 'error' },
  [ParseState.ParseCanceled]: { label: '已取消' },
  [ParseState.ParseInterrupted]: { label: '已中断', color: 'warning' },
};
export const isActiveParse = (state: ParseState) =>
  state === ParseState.ParseQueued || state === ParseState.ParseRunning;
export const noteKindLabel = (kind: NoteKind) =>
  kind === NoteKind.KindVideo ? '视频' : kind === NoteKind.KindImage ? '图文' : '未知类型';
export const formatTime = (value?: number | null) =>
  value ? new Date(value).toLocaleString('zh-CN') : '—';
export const formatBytes = (bytes?: number | null) => {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
};
