import { useCallback, useEffect } from 'react';
import { useInsightStore } from '../store/insightStore';
import { CACHE_VERSION } from '../utils/cacheVersion';
import type {
  InsightStats,
  TagData,
  TitleAnalysis,
  TopTitle,
  Topic,
  TrendReport,
} from '../store/insightStore';

const INSIGHT_CACHE_TTL_MS = 5 * 60 * 1000;

type InsightCachePayload = {
  topics: Topic[];
  tags: TagData[];
  topTitles: TopTitle[];
  stats: InsightStats | null;
  trendReport: TrendReport | null;
  titleAnalysis: TitleAnalysis | null;
  totalTopics: number;
};

type InsightCacheEntry = {
  payload: InsightCachePayload;
  fetchedAt: number;
};

const insightCache = new Map<string, InsightCacheEntry>();

const buildCacheKey = (themeId: string | number, days: number, sortBy: string, page: number) =>
  `${CACHE_VERSION}|${themeId}|${days}|${sortBy}|${page}`;

const readCache = (key: string) => {
  const entry = insightCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > INSIGHT_CACHE_TTL_MS) {
    insightCache.delete(key);
    return null;
  }
  return entry.payload;
};

const writeCache = (key: string, payload: InsightCachePayload) => {
  insightCache.set(key, { payload, fetchedAt: Date.now() });
};

const PAGE_SIZE = 20;

export function useInsightData(themeId: string | number) {
  const {
    topics, tags, topTitles, stats, trendReport, titleAnalysis, totalTopics, page,
    days, sortBy, loading, refreshing,
    setTopics, setTags, setTopTitles, setStats, setTrendReport, setTitleAnalysis,
    setLoading, setRefreshing, setDays, setSortBy, setTotalTopics, setPage,
  } = useInsightStore();

  const loadData = useCallback(async (options?: { force?: boolean }) => {
    const cacheKey = buildCacheKey(themeId, days, sortBy, page);
    if (!options?.force) {
      const cached = readCache(cacheKey);
      if (cached) {
        setTopics(cached.topics);
        setTags(cached.tags);
        setTopTitles(cached.topTitles);
        setStats(cached.stats);
        setTrendReport(cached.trendReport);
        setTitleAnalysis(cached.titleAnalysis);
        setTotalTopics(cached.totalTopics);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({ themeId: String(themeId) });
      if (days > 0) params.set('days', String(days));
      if (sortBy !== 'engagement') params.set('sortBy', sortBy);

      const topicsParams = new URLSearchParams({
        themeId: String(themeId),
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sortBy,
      });

      const [topicsRes, insightsRes, trendRes, analyzeRes] = await Promise.all([
        fetch(`/api/topics?${topicsParams}`),
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

      const payload = {
        topics: Array.isArray(topicsData?.topics) ? topicsData.topics : (Array.isArray(topicsData) ? topicsData : []),
        tags: Array.isArray(insightsData?.tags) ? insightsData.tags : [],
        topTitles: Array.isArray(insightsData?.topTitles) ? insightsData.topTitles : [],
        stats: insightsData?.stats || null,
        trendReport: trendData?.latest || null,
        titleAnalysis: analyzeData?.latest || null,
        totalTopics: topicsData?.total || 0,
      };

      setTopics(payload.topics);
      setTags(payload.tags);
      setTopTitles(payload.topTitles);
      setStats(payload.stats);
      setTrendReport(payload.trendReport);
      setTitleAnalysis(payload.titleAnalysis);
      setTotalTopics(payload.totalTopics);
      writeCache(cacheKey, payload);
    } catch (e) {
      console.error('Failed to load insight data:', e);
    } finally {
      setLoading(false);
    }
  }, [themeId, days, sortBy, page, setTopics, setTags, setTopTitles, setStats, setTrendReport, setTitleAnalysis, setLoading, setTotalTopics]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadData({ force: true });
    setRefreshing(false);
  }, [loadData, setRefreshing]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    // Data
    topics, tags, topTitles, stats, trendReport, titleAnalysis, totalTopics,
    // Filters
    days, sortBy, page, setDays, setSortBy, setPage,
    // States
    loading, refreshing,
    // Actions
    refresh,
    setTrendReport,
    setTitleAnalysis,
    // Pagination
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(totalTopics / PAGE_SIZE),
  };
}
