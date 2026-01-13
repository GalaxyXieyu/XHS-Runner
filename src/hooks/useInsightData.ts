import { useCallback, useEffect } from 'react';
import { useInsightStore } from '../store/insightStore';

export function useInsightData(themeId: string | number) {
  const {
    topics, tags, topTitles, stats, trendReport, titleAnalysis,
    days, sortBy, loading, refreshing,
    setTopics, setTags, setTopTitles, setStats, setTrendReport, setTitleAnalysis,
    setLoading, setRefreshing, setDays, setSortBy,
  } = useInsightStore();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ themeId: String(themeId) });
      if (days > 0) params.set('days', String(days));
      if (sortBy !== 'engagement') params.set('sortBy', sortBy);

      const [topicsRes, insightsRes, trendRes, analyzeRes] = await Promise.all([
        fetch(`/api/topics?themeId=${encodeURIComponent(String(themeId))}&limit=20`),
        fetch(`/api/insights?${params}`),
        fetch(`/api/insights/trend?themeId=${encodeURIComponent(String(themeId))}`),
        fetch(`/api/insights/analyze?themeId=${encodeURIComponent(String(themeId))}`),
      ]);

      const [topicsData, insightsData, trendData, analyzeData] = await Promise.all([
        topicsRes.json(),
        insightsRes.json(),
        trendRes.json(),
        analyzeRes.json(),
      ]);

      setTopics(topicsData);
      setTags(insightsData.tags || []);
      setTopTitles(insightsData.topTitles || []);
      setStats(insightsData.stats || null);
      setTrendReport(trendData.latest || null);
      setTitleAnalysis(analyzeData.latest || null);
    } catch (e) {
      console.error('Failed to load insight data:', e);
    } finally {
      setLoading(false);
    }
  }, [themeId, days, sortBy, setTopics, setTags, setTopTitles, setStats, setTrendReport, setTitleAnalysis, setLoading]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData, setRefreshing]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    // Data
    topics, tags, topTitles, stats, trendReport, titleAnalysis,
    // Filters
    days, sortBy, setDays, setSortBy,
    // States
    loading, refreshing,
    // Actions
    refresh,
    setTrendReport,
    setTitleAnalysis,
  };
}
