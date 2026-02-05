/**
 * 数据指标 Hook
 */

import { useState, useEffect, useCallback } from 'react';

export interface MetricsSummary {
  published: number;
  queued: number;
  pendingReplies: number;
  metrics: Record<string, number>;
}

export interface TrendData {
  date: string;
  views: number;
  likes: number;
  collects?: number;
  comments?: number;
}

export interface PublishedNote {
  id: string;
  noteId?: string;
  title: string;
  publishTime: string;
  views: number;
  likes: number;
  comments: number;
  collects?: number;
  trend: 'up' | 'down' | 'stable';
  shouldDelete: boolean;
}

interface UseMetricsOptions {
  themeId?: number | string;
  days?: number;
}

export function useMetrics(options: UseMetricsOptions = {}) {
  const { themeId, days = 7 } = options;
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [trend, setTrend] = useState<TrendData[]>([]);
  const [publishedNotes, setPublishedNotes] = useState<PublishedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams({ days: String(days) });

      const res = await fetch(`/api/operations/metrics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch metrics');

      const data = await res.json();
      setSummary(data.summary || null);

      // 转换趋势数据为图表格式
      const trendMap: Record<string, TrendData> = {};
      for (const [key, values] of Object.entries(data.trend || {})) {
        for (const item of values as { date: string; value: number }[]) {
          if (!trendMap[item.date]) {
            trendMap[item.date] = { date: item.date, views: 0, likes: 0 };
          }
          // 只更新数值字段
          if (key === 'views' || key === 'likes' || key === 'collects' || key === 'comments') {
            (trendMap[item.date] as any)[key] = item.value;
          }
        }
      }
      setTrend(Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date)));

      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  const fetchPublishedNotes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (themeId) params.set('themeId', String(themeId));

      const res = await fetch(`/api/operations/published-notes?${params}`);
      if (!res.ok) throw new Error('Failed to fetch published notes');

      const data = await res.json();
      setPublishedNotes(data.notes || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [themeId]);

  useEffect(() => {
    fetchMetrics();
    fetchPublishedNotes();
  }, [fetchMetrics, fetchPublishedNotes]);

  // 同步指标
  const syncMetrics = useCallback(async (publishRecordId?: number) => {
    try {
      const res = await fetch('/api/operations/metrics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishRecordId }),
      });
      if (!res.ok) throw new Error('Failed to sync metrics');
      await fetchMetrics();
      await fetchPublishedNotes();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchMetrics, fetchPublishedNotes]);

  return {
    summary,
    trend,
    publishedNotes,
    loading,
    error,
    refresh: () => {
      fetchMetrics();
      fetchPublishedNotes();
    },
    syncMetrics,
  };
}
