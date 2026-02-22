/**
 * 发布队列 Hook
 * 复用 taskCenterUtils 的状态处理逻辑
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface PublishTask {
  id: string;
  title: string;
  thumbnail: string;
  scheduledTime: string;
  status: 'pending' | 'queued' | 'running' | 'published' | 'failed';
  creativeId?: number;
  themeId?: number;
  errorMessage?: string;
}

interface UsePublishQueueOptions {
  themeId?: number | string;
  pollInterval?: number; // 轮询间隔（毫秒），0 表示不轮询
  onRequireXhsLogin?: () => void;
}

export function usePublishQueue(options: UsePublishQueueOptions = {}) {
  const { themeId, pollInterval = 3000, onRequireXhsLogin } = options;
  const [queue, setQueue] = useState<PublishTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const fetchQueue = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const params = new URLSearchParams();
      if (themeId) params.set('themeId', String(themeId));

      const res = await fetch(`/api/operations/queue?${params}`);
      if (!res.ok) throw new Error('Failed to fetch queue');

      const data = await res.json();
      setQueue(data.queue || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [themeId]);

  // 初始加载
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // 轮询（当有 running/queued 状态时）
  useEffect(() => {
    if (pollInterval <= 0) return;

    const hasActiveTask = queue.some((t) => t.status === 'running' || t.status === 'queued');
    if (!hasActiveTask) return;

    const timer = setInterval(fetchQueue, pollInterval);
    return () => clearInterval(timer);
  }, [queue, pollInterval, fetchQueue]);

  // 立即发布
  const publishNow = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/operations/queue/${id}/publish`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === 'NOT_LOGGED_IN') {
          onRequireXhsLogin?.();
        }
        throw new Error(data?.error || '发布失败');
      }
      await fetchQueue(); // 刷新列表
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchQueue, onRequireXhsLogin]);

  // 删除任务
  const deleteTask = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/operations/queue/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setQueue((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  return {
    queue,
    loading,
    error,
    refresh: fetchQueue,
    publishNow,
    deleteTask,
  };
}
