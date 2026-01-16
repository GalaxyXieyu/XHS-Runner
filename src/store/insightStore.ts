import { create } from 'zustand';

// Types
export interface TagData {
  tag: string;
  count: number;
  weight: number;
}

export interface TopTitle {
  title: string;
  like_count: number;
  collect_count: number;
  comment_count: number;
  created_at?: string;
}

export interface InsightStats {
  totalNotes: number;
  totalTags: number;
  totalTitles: number;
  totalEngagement: number;
  avgEngagement: number;
}

export interface TrendReport {
  analysis: string;
  report_date: string;
  stats?: any;
}

export interface TitleAnalysis {
  analysis: string;
  analyzed_at: string;
}

export interface Topic {
  id: number;
  title: string;
  url?: string | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
  keyword?: string | null;
  like_count?: number | null;
  collect_count?: number | null;
  comment_count?: number | null;
  cover_url?: string | null;
  published_at?: string | null;
  status?: string | null;
}

export type SortBy = 'engagement' | 'likes' | 'collects' | 'comments' | 'recent';

interface InsightState {
  // Data
  topics: Topic[];
  tags: TagData[];
  topTitles: TopTitle[];
  stats: InsightStats | null;
  trendReport: TrendReport | null;
  titleAnalysis: TitleAnalysis | null;
  totalTopics: number;

  // Filters
  days: number;
  sortBy: SortBy;
  page: number;

  // Loading states
  loading: boolean;
  refreshing: boolean;

  // Actions
  setTopics: (topics: Topic[]) => void;
  setTags: (tags: TagData[]) => void;
  setTopTitles: (titles: TopTitle[]) => void;
  setStats: (stats: InsightStats | null) => void;
  setTrendReport: (report: TrendReport | null) => void;
  setTitleAnalysis: (analysis: TitleAnalysis | null) => void;
  setTotalTopics: (total: number) => void;
  setDays: (days: number) => void;
  setSortBy: (sortBy: SortBy) => void;
  setPage: (page: number) => void;
  setLoading: (loading: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  reset: () => void;
}

const initialState = {
  topics: [],
  tags: [],
  topTitles: [],
  stats: null,
  trendReport: null,
  titleAnalysis: null,
  totalTopics: 0,
  days: 0,
  sortBy: 'engagement' as SortBy,
  page: 0,
  loading: true,
  refreshing: false,
};

export const useInsightStore = create<InsightState>((set) => ({
  ...initialState,
  setTopics: (topics) => set({ topics }),
  setTags: (tags) => set({ tags }),
  setTopTitles: (topTitles) => set({ topTitles }),
  setStats: (stats) => set({ stats }),
  setTrendReport: (trendReport) => set({ trendReport }),
  setTitleAnalysis: (titleAnalysis) => set({ titleAnalysis }),
  setTotalTopics: (totalTopics) => set({ totalTopics }),
  setDays: (days) => set({ days, page: 0 }),
  setSortBy: (sortBy) => set({ sortBy, page: 0 }),
  setPage: (page) => set({ page }),
  setLoading: (loading) => set({ loading }),
  setRefreshing: (refreshing) => set({ refreshing }),
  reset: () => set(initialState),
}));
