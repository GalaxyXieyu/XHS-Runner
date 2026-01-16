import { useCallback, useMemo, useState } from 'react';
import { useCompletion } from '@ai-sdk/react';
import {
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FileText,
  Hash,
  Heart,
  List,
  Loader2,
  MessageCircle,
  RefreshCw,
  Settings2,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ThinkingBlock } from '@/components/ui/ThinkingBlock';
import { NoteDetailModal, type NoteDetailData } from '@/components/NoteDetailModal';
import { useInsightData, useLLMProviders } from '@/hooks';
import type { SortBy } from '@/store';
import type { Theme } from '@/App';

interface InsightTabProps {
  theme: Theme;
}

export function InsightTab({ theme }: InsightTabProps) {
  const [tagView, setTagView] = useState<'list' | 'cloud'>('list');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNote, setSelectedNote] = useState<NoteDetailData | null>(null);

  const {
    topics,
    tags,
    topTitles,
    stats,
    trendReport,
    titleAnalysis,
    totalTopics,
    days,
    sortBy,
    page,
    setDays,
    setSortBy,
    setPage,
    loading,
    refreshing,
    refresh,
    setTrendReport,
    setTitleAnalysis,
    totalPages,
  } = useInsightData(theme.id);

  const {
    providers: llmProviders,
    profiles: promptProfiles,
    selectedProviderId,
    selectedPromptId,
    setSelectedProviderId,
    setSelectedPromptId,
  } = useLLMProviders('分析');

  const {
    completion: analysis,
    isLoading: analyzing,
    complete: runAnalysis,
  } = useCompletion({
    api: '/api/insights/analyze',
    streamProtocol: 'text',
    body: {
      themeId: theme.id,
      days,
      sortBy,
      providerId: selectedProviderId,
      promptId: selectedPromptId,
    },
    onFinish: (_, completion) => {
      setTitleAnalysis({ analysis: completion as string, analyzed_at: new Date().toISOString() });
    },
  });

  const {
    completion: trendAnalysis,
    isLoading: generatingTrend,
    complete: generateTrend,
  } = useCompletion({
    api: `/api/insights/trend?themeId=${theme.id}`,
    streamProtocol: 'text',
    body: {
      providerId: selectedProviderId,
    },
    onFinish: (_, completion) => {
      setTrendReport({ analysis: completion as string, report_date: new Date().toISOString().split('T')[0] });
    },
  });

  const handleRunAnalysis = useCallback(() => {
    runAnalysis('');
  }, [runAnalysis]);

  const handleGenerateTrend = useCallback(() => {
    setTrendReport({ analysis: '', report_date: new Date().toISOString().split('T')[0] });
    generateTrend('');
  }, [generateTrend, setTrendReport]);

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const formatCount = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  const titleAnalysisText = useMemo(() => {
    if (analyzing) return analysis;
    return titleAnalysis?.analysis || analysis;
  }, [analyzing, analysis, titleAnalysis?.analysis]);

  const trendReportText = useMemo(() => {
    if (generatingTrend) return trendAnalysis;
    return trendReport?.analysis || trendAnalysis;
  }, [generatingTrend, trendAnalysis, trendReport?.analysis]);

  const showSkeleton = loading && !refreshing;

  const getTagValue = useCallback((tag: { weight?: unknown; count?: unknown }) => {
    const weight = Number(tag.weight ?? 0);
    const count = Number(tag.count ?? 0);
    if (Number.isFinite(weight) && weight > 0) return weight;
    if (Number.isFinite(count) && count > 0) return count;
    return 0;
  }, []);

  const buildImageProxySrc = useCallback((url?: string | null, referer?: string | null) => {
    if (!url) return null;
    const qs = new URLSearchParams({ url });
    if (referer) qs.set('referer', referer);
    return `/api/image?${qs.toString()}`;
  }, []);

  // Convert topic to NoteDetailData for modal
  const topicToNoteDetail = useCallback((topic: typeof topics[0]): NoteDetailData => {
    const images: string[] = [];
    // Add cover image
    if (topic.cover_url) {
      const coverSrc = buildImageProxySrc(topic.cover_url, topic.url);
      if (coverSrc) images.push(coverSrc);
    }

    return {
      id: String(topic.id),
      title: topic.title || '',
      desc: '',
      images,
      user: {
        nickname: topic.author_name || '未知作者',
        avatar: topic.author_avatar_url ? buildImageProxySrc(topic.author_avatar_url, topic.url) || '' : '',
      },
      interactInfo: {
        likedCount: topic.like_count || 0,
        collectedCount: topic.collect_count || 0,
        commentCount: topic.comment_count || 0,
      },
      tags: topic.keyword ? [topic.keyword] : [],
      time: topic.published_at ? new Date(topic.published_at).getTime() : undefined,
    };
  }, [buildImageProxySrc]);

  return (
    <div className="space-y-3">
      {/* Trend Report Card - Compact */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-lg p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-sm font-medium text-gray-900">趋势报告</span>
            {trendReport && <span className="text-xs text-gray-500 truncate">{trendReport.report_date}</span>}
          </div>
          <button
            onClick={handleGenerateTrend}
            disabled={generatingTrend}
            className="ml-2 px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 flex items-center gap-1.5 disabled:opacity-50 shrink-0 whitespace-nowrap transition-colors"
          >
            {generatingTrend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{generatingTrend ? '生成中...' : '生成报告'}</span>
          </button>
        </div>
        {trendReportText ? (
          <ThinkingBlock content={trendReportText} isStreaming={generatingTrend} />
        ) : showSkeleton ? (
          <div className="bg-white rounded-lg p-2.5 animate-pulse space-y-2">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-5/6" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
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
        {/* AI 设置按钮 */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            showSettings ? 'bg-purple-50 border-purple-200 text-purple-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          AI设置
        </button>
        <div className="text-xs text-gray-400 ml-auto">标签按互动加权排序</div>
      </div>

      {/* AI Settings Panel */}
      {showSettings && (
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">选择模型</label>
              <select
                value={selectedProviderId || ''}
                onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : null)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value="">使用默认设置</option>
                {llmProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.model_name ? ` (${p.model_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">分析提示词</label>
              <select
                value={selectedPromptId || ''}
                onChange={(e) => setSelectedPromptId(e.target.value ? Number(e.target.value) : null)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value="">使用默认提示词</option>
                {promptProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {showSkeleton ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 bg-gray-200 rounded w-16" />
                <div className="h-4 w-4 bg-gray-200 rounded" />
              </div>
              <div className="h-6 bg-gray-200 rounded w-10 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">抓取笔记</span>
              <TrendingUp className="w-3.5 h-3.5 text-red-400" />
            </div>
            <div className="text-xl font-bold text-gray-900">{stats?.totalNotes || 0}</div>
            <div className="text-xs text-gray-400">总计</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">热门标签</span>
              <Hash className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold text-gray-900">{stats?.totalTags || 0}</div>
            <div className="text-xs text-gray-400">已提取</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">平均互动</span>
              <Star className="w-3.5 h-3.5 text-yellow-400" />
            </div>
            <div className="text-xl font-bold text-gray-900">{formatCount(stats?.avgEngagement || 0)}</div>
            <div className="text-xs text-gray-400">每篇</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">总互动</span>
              <Users className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="text-xl font-bold text-gray-900">{formatCount(stats?.totalEngagement || 0)}</div>
            <div className="text-xs text-gray-400">点赞+收藏</div>
          </div>
        </div>
      )}

      {/* Top Titles with AI Analysis */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Star className="w-4 h-4 text-yellow-500 shrink-0" />
            <span className="text-sm font-medium text-gray-900">爆款标题 Top10</span>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={analyzing || topTitles.length < 5}
            className="ml-2 px-3 py-1.5 bg-purple-500 text-white text-xs font-medium rounded hover:bg-purple-600 flex items-center gap-1.5 disabled:opacity-50 transition-colors shrink-0 whitespace-nowrap"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{analyzing ? '分析中...' : '生成分析'}</span>
          </button>
        </div>
	        {/* AI Analysis Result */}
	        {titleAnalysisText ? (
	          <div className="mb-3">
	            <ThinkingBlock content={titleAnalysisText} isStreaming={analyzing} />
	          </div>
	        ) : showSkeleton ? (
	          <div className="mb-3 bg-gray-50 rounded-lg p-3 animate-pulse space-y-2">
	            <div className="h-3 bg-gray-200 rounded w-1/3" />
	            <div className="h-3 bg-gray-200 rounded w-5/6" />
	            <div className="h-3 bg-gray-200 rounded w-2/3" />
	          </div>
	        ) : (
	          <div className="mb-3 text-xs text-gray-400 bg-gray-50 rounded-lg p-3 text-center">
	            {topTitles.length < 5 ? '数据不足，请先抓取更多笔记' : '点击“生成分析”获取AI标题分析'}
	          </div>
	        )}
        {/* Title List */}
        {showSkeleton ? (
          <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1 animate-pulse">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="p-2.5 bg-gray-50 rounded-lg">
                <div className="h-3 bg-gray-200 rounded w-5/6 mb-2" />
                <div className="flex gap-3">
                  <div className="h-3 bg-gray-200 rounded w-10" />
                  <div className="h-3 bg-gray-200 rounded w-10" />
                  <div className="h-3 bg-gray-200 rounded w-10" />
                </div>
              </div>
            ))}
          </div>
        ) : topTitles.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
            {topTitles.map((t, idx) => (
              <div key={idx} className="p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="text-xs text-gray-900 line-clamp-1 mb-1.5 font-medium">
                  {idx + 1}. {t.title}
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3 text-red-400" />
                    {formatCount(t.like_count || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-400" />
                    {formatCount(t.collect_count || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-blue-400" />
                    {t.comment_count || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 text-center py-6">暂无数据</div>
        )}
      </div>

      {/* Tag Word Cloud */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Hash className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-900">热门标签</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setTagView('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  tagView === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                }`}
                title="列表视图"
              >
                <List className="w-3.5 h-3.5 text-gray-600" />
              </button>
              <button
                onClick={() => setTagView('cloud')}
                className={`p-1.5 rounded-md transition-colors ${
                  tagView === 'cloud' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                }`}
                title="词云视图"
              >
                <Cloud className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {showSkeleton ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="h-3 bg-gray-200 rounded w-20" />
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-200 rounded-full w-2/3" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-8" />
              </div>
            ))}
          </div>
        ) : tags.length > 0 ? (
	          tagView === 'list' ? (
		            <div className="space-y-1.5">
		              {(() => {
		                const ordered = [...tags].sort((a, b) => {
		                  const av = getTagValue(a);
		                  const bv = getTagValue(b);
		                  return bv - av;
		                });
		                const top = ordered.slice(0, 12);
		                const values = top
		                  .map((t) => getTagValue(t))
		                  .filter((v) => Number.isFinite(v) && v > 0);
		                const maxValue = Math.max(1, ...values);

		                return top.map((item, idx) => {
		                  const value = getTagValue(item);
		                  const rawPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
		                  const percent = value > 0 ? Math.max(12, Math.round(rawPercent)) : 0;
		                  return (
		                    <div key={idx} className="flex items-center gap-2">
		                      <span className="w-20 text-xs text-gray-700 truncate" title={item.tag}>
		                        {item.tag}
	                      </span>
	                      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
	                        <div
	                          className="h-full rounded-full"
	                          style={{
	                            width: `${percent}%`,
	                            background: 'linear-gradient(to right, #f87171, #ef4444)'
	                          }}
	                        />
	                      </div>
	                      <span className="w-8 text-xs text-gray-500 text-right">{item.count}</span>
	                    </div>
	                  );
	                });
	              })()}
	            </div>
          ) : (
	            <div className="flex flex-wrap items-center justify-center gap-3 py-6 min-h-[140px] bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg">
	              {(() => {
	                const maxWeight = Math.max(1, ...tags.map((t) => getTagValue(t)));
	                const colors = [
	                  'text-red-500',
	                  'text-blue-600',
	                  'text-emerald-500',
                  'text-purple-500',
                  'text-orange-500',
                  'text-pink-500',
                  'text-cyan-600',
                  'text-indigo-500',
	                  'text-amber-500',
	                  'text-teal-500',
	                ];
	                return tags.slice(0, 20).map((item, idx) => {
	                  const ratio = getTagValue(item) / maxWeight;
	                  const fontSize = 14 + ratio * 18;
	                  return (
	                    <span
	                      key={idx}
                      className={`${colors[idx % colors.length]} hover:scale-110 cursor-default transition-transform`}
                      style={{
                        fontSize: `${fontSize}px`,
                        fontWeight: ratio > 0.6 ? 700 : ratio > 0.3 ? 500 : 400,
                      }}
                      title={`${item.tag}: ${item.count}次, 权重${item.weight || 0}`}
                    >
                      {item.tag}
                    </span>
                  );
                });
              })()}
            </div>
          )
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
        {showSkeleton && topics.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 animate-pulse">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-20 h-20 rounded-lg bg-gray-200" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-5/6" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                  <div className="flex gap-3">
                    <div className="h-3 bg-gray-200 rounded w-10" />
                    <div className="h-3 bg-gray-200 rounded w-10" />
                    <div className="h-3 bg-gray-200 rounded w-10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6">暂无数据，请先抓取笔记</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {topics.slice(0, 2).map((topic) => {
              const coverSrc = buildImageProxySrc(topic.cover_url, topic.url);

              return (
                <div
                  key={topic.id}
                  onClick={() => setSelectedNote(topicToNoteDetail(topic))}
                  className="flex gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="w-20 h-20 rounded-lg flex-shrink-0 bg-gray-200 overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">无封面</div>
                    {coverSrc && (
                      <img
                        src={coverSrc}
                        alt={topic.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">{topic.title}</div>
                    <div className="text-xs text-gray-500 mb-2">
                      {topic.author_name || '未知作者'}
                      {topic.keyword ? ` · ${topic.keyword}` : ''}
                    </div>
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes Grid */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-900">全部笔记 ({totalTopics || stats?.totalNotes || topics.length})</div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0 || loading}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-600">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {loading && topics.length > 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">加载中...</span>
          </div>
        ) : showSkeleton && topics.length === 0 ? (
          <div className="grid grid-cols-5 gap-3 animate-pulse">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div key={idx} className="group">
                <div className="relative mb-2 overflow-hidden rounded-lg bg-gray-100">
                  <div className="w-full h-32 bg-gray-200" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-5/6 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6">暂无数据</div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {topics.map((topic) => {
              const coverSrc = buildImageProxySrc(topic.cover_url, topic.url);

              return (
                <div
                  key={topic.id}
                  onClick={() => setSelectedNote(topicToNoteDetail(topic))}
                  className="group cursor-pointer"
                >
                  <div className="relative mb-2 overflow-hidden rounded-lg bg-gray-100 h-32">
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">无封面</div>
                    {coverSrc && (
                      <img
                        src={coverSrc}
                        alt={topic.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {formatCount(topic.like_count || 0)}
                    </div>
                  </div>
                  <div className="text-xs font-medium text-gray-900 mb-1 line-clamp-2 group-hover:text-red-500 transition-colors">
                    {topic.title}
                  </div>
                  <div className="text-xs text-gray-500 mb-1">{topic.author_name || '未知作者'}</div>
                  {topic.keyword && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md">#{topic.keyword}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Note Detail Modal */}
      <NoteDetailModal
        note={selectedNote}
        open={!!selectedNote}
        onClose={() => setSelectedNote(null)}
      />
    </div>
  );
}
