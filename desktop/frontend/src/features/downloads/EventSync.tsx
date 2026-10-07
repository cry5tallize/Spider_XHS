import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DownloadEventBatch, DownloadTask } from '@/shared/contracts';
import { getDownloadActive, getDownloadChanges, subscribeDownloads } from './api';
import { progressStore } from './progress-store';

// Mounted once at application root. Routes consume the store, never SDK events.
export function DownloadEventSync() {
  const client = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    let run = '',
      sequence = 0,
      ready = false,
      busy = false,
      force = false;
    let pending: DownloadEventBatch[] = [];
    const invalidate = (tasks: DownloadTask[]) => {
      const old = progressStore.snapshot().tasks;
      const changed = tasks.filter((task) => old.get(task.id)?.revision !== task.revision);
      if (changed.length) {
        void client.invalidateQueries({ queryKey: ['downloads'] });
        void client.invalidateQueries({ queryKey: ['download-history'] });
        for (const task of changed)
          void client.invalidateQueries({ queryKey: ['download-items', task.id] });
      }
    };
    const apply = (batch: DownloadEventBatch) => {
      if (batch.run_id !== run || batch.needs_resync) {
        force = true;
        return false;
      }
      if (batch.sequence <= sequence) return true;
      if (batch.sequence !== sequence + 1) return false;
      invalidate(batch.changes ?? []);
      progressStore.merge(batch.changes ?? [], true);
      sequence = batch.sequence;
      return true;
    };
    const sync = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      try {
        if (!ready || force) {
          const current = await getDownloadActive(controller.signal);
          if (controller.signal.aborted) return;
          run = current.run_id;
          sequence = current.sequence;
          ready = true;
          force = false;
          progressStore.merge(current.tasks ?? [], true, true);
          void client.invalidateQueries({ queryKey: ['downloads'] });
          void client.invalidateQueries({ queryKey: ['download-history'] });
        }
        const changes = await getDownloadChanges({ run_id: run, sequence }, controller.signal);
        if (controller.signal.aborted) return;
        if (changes.needs_resync) {
          force = true;
          ready = false;
          return;
        }
        for (const batch of changes.batches ?? [])
          if (!apply(batch)) {
            force = true;
            break;
          }
        const buffered = pending.sort((a, b) => a.sequence - b.sequence);
        pending = [];
        for (const batch of buffered)
          if (!apply(batch)) {
            pending.push(batch);
            break;
          }
      } catch {
        if (!controller.signal.aborted) progressStore.merge([], false);
      } finally {
        busy = false;
      }
    };
    const off = subscribeDownloads((batch) => {
      if (controller.signal.aborted) return;
      if (!ready || busy || !apply(batch)) {
        if (pending.length >= 128) {
          pending = [];
          force = true;
        }
        pending.push(batch);
        void sync();
      }
    });
    void sync();
    // Repairs a missing last event even if no later event exposes the gap.
    const timer = setInterval(() => {
      void sync();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
      off();
      progressStore.merge([], false);
    };
  }, [client]);
  return null;
}
