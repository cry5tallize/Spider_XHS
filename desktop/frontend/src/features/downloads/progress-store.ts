import { useSyncExternalStore } from 'react';
import type { DownloadTask } from '@/shared/contracts';
import { DownloadState } from '@/shared/contracts';

const listeners = new Set<() => void>();
let snapshot = { tasks: new Map<string, DownloadTask>(), connected: false };
export const isActiveDownload = (state: DownloadState) =>
  state === DownloadState.Queued ||
  state === DownloadState.Running ||
  state === DownloadState.WaitingRetry;
export const progressStore = {
  snapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  merge(tasks: DownloadTask[], connected = snapshot.connected, replaceActive = false) {
    const next = new Map(snapshot.tasks);
    if (replaceActive)
      for (const [id, task] of next) if (isActiveDownload(task.state)) next.delete(id);
    for (const task of tasks)
      if ((next.get(task.id)?.revision ?? -1) <= task.revision) next.set(task.id, task);
    const finished = [...next.values()]
      .filter((task) => !isActiveDownload(task.state))
      .sort((a, b) => b.updated_at_ms - a.updated_at_ms);
    for (const task of finished.slice(128)) next.delete(task.id);
    snapshot = { tasks: next, connected };
    for (const listener of listeners) listener();
  },
};
export const useDownloadProgress = () =>
  useSyncExternalStore(progressStore.subscribe, progressStore.snapshot);
export const overlayProgress = (task: DownloadTask, live: Map<string, DownloadTask>) => {
  const current = live.get(task.id);
  return current && current.revision >= task.revision ? current : task;
};
