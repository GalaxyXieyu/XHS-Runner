import { useState, useEffect } from 'react';
import { TrendingUp, Hash, MessageCircle, RefreshCw, Heart, Star, Users, Loader2, Sparkles, Calendar, ArrowUpDown, FileText } from 'lucide-react';
import type { Theme } from '../../App';

interface InsightTabProps {
  theme: Theme;
}

interface Topic {
  id: number;
  title: string;
  url: string;
  author_name: string;
  author_avatar_url: string;
  like_count: number;
  collect_count: number;
  comment_count: number;
  cover_url: string;
  published_at: string;
  status: string;
  keyword?: string;
}

interface TagData {
  tag: string;
  count: number;
  weight?: number;
}

interface TopTitle {
  title: string;
  like_count: number;
  collect_count: number;
  comment_count: number;
}

type SortBy = 'engagement' | 'likes' | 'collects' | 'comments' | 'recent';

export function InsightTab({ theme }: InsightTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<TagData[]>([]);
  const [topTitles, setTopTitles] = useState<TopTitle[]>([]);
  const [analysis, setAnalysis] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);

  // 趋势报告
  const [trendReport, setTrendReport] = useState<{ analysis: string; report_date: string } | null>(null);
  const [generatingTrend, setGeneratingTrend] = useState(false);

  // 筛选参数
  const [days, setDays] = useState<number>(0);  // 0=全部, 7, 30
  const [sortBy, setSortBy] = useState<SortBy>('engagement');

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ themeId: String(theme.id) });
      if (days > 0) params.set('days', String(days));
      if (sortBy !== 'engagement') params.set('sortBy', sortBy);

      const [topicsRes, insightsRes, trendRes] = await Promise.all([
        fetch(`/api/topics?themeId=${theme.id}&limit=20`),
        fetch(`/api/insights?${params}`),
        fetch(`/api/insights/trend?themeId=${theme.id}`)
      ]);
      const topicsData = await topicsRes.json();
      const insightsData = await insightsRes.json();
      const trendData = await trendRes.json();

      setTopics(topicsData);
      setTags(insightsData.tags || []);
      setTopTitles(insightsData.topTitles || []);
      setTrendReport(trendData.latest || null);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/insights/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId: theme.id, days, sortBy })
      });
      const data = await res.json();
      setAnalysis(data.analysis || '分析失败');
    } catch (e) {
      setAnalysis('分析失败: ' + (e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const generateTrendReport = async () => {
    setGeneratingTrend(true);
    try {
      const res = await fetch(`/api/insights/trend?themeId=${theme.id}`, {
        method: 'POST'
      });
      const data = await res.json();
      setTrendReport({ analysis: data.analysis, report_date: data.stats?.date || new Date().toISOString().split('T')[0] });
      loadData(); // 刷新历史数据
    } catch (e) {
      console.error('Failed to generate trend report:', e);
    } finally {
      setGeneratingTrend(false);
    }
  };

  useEffect(() => {
    loadData();
    setAnalysis('');
  }, [theme.id, days, sortBy]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData().finally(() => setIsRefreshing(false));
  };

  const formatCount = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  return (
    <div className="space-y-3">
      {/* Trend Report Card - Compact */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-gray-900">趋势报告</span>
            {trendReport && <span className="text-xs text-gray-500">{trendReport.report_date}</span>}
          </div>
          <button
            onClick={generateTrendReport}
            disabled={generatingTrend}
            className="px-2.5 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 flex items-center gap-1 disabled:opacity-50"
          >
            {generatingTrend ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {generatingTrend ? '生成中...' : '生成报告'}
          </button>
        </div>
        {trendReport?.analysis ? (
          <div className="text-xs text-gray-600 leading-relaxed bg-white rounded-lg p-2.5 max-h-20 overflow-y-auto">{trendReport.analysis}</div>
        ) : (
          <div className="text-xs text-gray-400 bg-white rounded-lg p-2.5 text-center">点击"生成报告"获取AI趋势分析</div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          >
            <option value={0}>全部时间</option>
            <option value={7}>近7天</option>
            <option value={30}>近30天</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          >
            <option value="engagement">综合互动</option>
            <option value="likes">点赞数</option>
            <option value="collects">收藏数</option>
            <option value="comments">评论数</option>
            <option value="recent">最新发布</option>
          </select>
        </div>
        <div className="text-xs text-gray-400 ml-auto">
          标签按互动加权排序
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">抓取笔记</span>
            <TrendingUp className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-xl font-bold text-gray-900">{topics.length}</div>
          <div className="text-xs text-gray-400">已抓取</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">热门标签</span>
            <Hash className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-gray-900">{tags.length}</div>
          <div className="text-xs text-gray-400">已提取</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Top标题</span>
            <Star className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <div className="text-xl font-bold text-gray-900">{topTitles.length}</div>
          <div className="text-xs text-gray-400">已分析</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">总互动</span>
            <Users className="w-3.5 h-3.5 text-green-400" />
          </div>
          <div className="text-xl font-bold text-gray-900">{formatCount(topics.reduce((sum, t) => sum + (t.like_count || 0) + (t.collect_count || 0), 0))}</div>
          <div className="text-xs text-gray-400">点赞+收藏</div>
        </div>
      </div>

      {/* Top Titles with AI Analysis */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Star className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium text-gray-900">爆款标题 Top10</span>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing || topTitles.length < 5}
            className="px-2.5 py-1 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 flex items-center gap-1 disabled:opacity-50 transition-colors"
          >
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {analyzing ? '分析中...' : '生成分析'}
          </button>
        </div>
        {/* AI Analysis Result */}
        {analysis && (
          <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap bg-purple-50 rounded-lg p-2.5 mb-3 max-h-28 overflow-y-auto">{analysis}</div>
        )}
        {/* Title List */}
        {topTitles.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
            {topTitles.map((t, idx) => (
              <div key={idx} className="p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="text-xs text-gray-900 line-clamp-1 mb-1.5 font-medium">{idx + 1}. {t.title}</div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" />{formatCount(t.like_count)}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" />{formatCount(t.collect_count)}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3 text-blue-400" />{t.comment_count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 text-center py-6">暂无数据</div>
        )}
      </div>

      {/* Top Tags */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Hash className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-900">热门标签</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 15).map((item, idx) => (
              <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-lg">
                {item.tag} · {item.count}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 text-center py-4">暂无数据，请先抓取笔记</div>
        )}
      </div>

      {/* Captured Notes - Top 2 */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-3">
          <Users className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-gray-900">热门笔记</span>
        </div>
        {loading ? (
          <div className="text-xs text-gray-500 text-center py-6">加载中...</div>
        ) : topics.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6">暂无数据，请先抓取笔记</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {topics.slice(0, 2).map((topic) => (
              <a
                key={topic.id}
                href={topic.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                {topic.cover_url && (
                  <img
                    src={topic.cover_url}
                    alt={topic.title}
                    className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">{topic.title}</div>
                  <div className="text-xs text-gray-500 mb-2">{topic.author_name} · {topic.keyword}</div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3 text-red-400" />
                      {formatCount(topic.like_count || 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-400" />
                      {formatCount(topic.collect_count || 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3 text-blue-400" />
                      {topic.comment_count || 0}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Notes Grid */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="text-sm font-medium text-gray-900 mb-3">全部笔记 ({topics.length})</div>
        {loading ? (
          <div className="text-xs text-gray-500 text-center py-6">加载中...</div>
        ) : topics.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6">暂无数据</div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {topics.slice(0, 8).map((topic) => (
              <a
                key={topic.id}
                href={topic.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group cursor-pointer"
              >
                <div className="relative mb-2 overflow-hidden rounded-lg bg-gray-100">
                  {topic.cover_url ? (
                    <img
                      src={topic.cover_url}
                      alt={topic.title}
                      className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-32 flex items-center justify-center text-gray-400 text-xs">无封面</div>
                  )}
                  <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    {formatCount(topic.like_count || 0)}
                  </div>
                </div>
                <div className="text-xs font-medium text-gray-900 mb-1 line-clamp-2 group-hover:text-red-500 transition-colors">
                  {topic.title}
                </div>
                <div className="text-xs text-gray-500 mb-1">{topic.author_name}</div>
                {topic.keyword && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md">
                    #{topic.keyword}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
