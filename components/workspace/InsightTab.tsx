import { useState, useEffect } from 'react';
import { TrendingUp, Hash, MessageCircle, RefreshCw, Heart, Star, Users } from 'lucide-react';
import type { Theme } from '../../App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

// Mock data for features not yet implemented
const tagCloudData = [
  { tag: '#防晒', count: 245 },
  { tag: '#夏季护肤', count: 198 },
  { tag: '#防晒霜测评', count: 176 },
  { tag: '#美白', count: 154 },
  { tag: '#敏感肌', count: 132 },
  { tag: '#油皮', count: 121 },
  { tag: '#学生党', count: 98 },
  { tag: '#平价好物', count: 87 }
];

const titlePatterns = [
  { pattern: '千万别...', count: 45, example: '千万别买这些防晒霜！踩雷合集' },
  { pattern: '3秒教会你...', count: 38, example: '3秒教会你挑选防晒霜的秘诀' },
  { pattern: '实测...款', count: 32, example: '实测10款防晒霜，这3款真的绝了' },
  { pattern: '新手必看', count: 28, example: '新手必看！防晒选购避坑指南' }
];

const userInsights = [
  { type: '痛点', content: '夏天防晒霜容易搓泥，和底妆不兼容', count: 187 },
  { type: '需求', content: '求推荐适合油皮的清爽型防晒', count: 156 },
  { type: '疑问', content: '防晒霜需要卸妆吗？', count: 143 },
  { type: '避雷', content: '某品牌防晒闷痘严重，不推荐', count: 98 }
];

export function InsightTab({ theme }: InsightTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTopics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/topics?themeId=${theme.id}&limit=20`);
      const data = await res.json();
      setTopics(data);
    } catch (e) {
      console.error('Failed to load topics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopics();
  }, [theme.id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadTopics().finally(() => setIsRefreshing(false));
  };

  const formatCount = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">抓取笔记</span>
            <TrendingUp className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">{topics.length}</div>
          <div className="text-xs text-gray-500">已抓取</div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">热门标签</span>
            <Hash className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">245</div>
          <div className="text-xs text-gray-500">覆盖率 89%</div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">评论分析</span>
            <MessageCircle className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">8,765</div>
          <div className="text-xs text-gray-500">痛点 +23</div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">竞品动态</span>
            <Users className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">12</div>
          <div className="text-xs text-gray-500">今日更新</div>
        </div>
      </div>

      {/* Top Tags */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs font-medium text-gray-900">热门标签</span>
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
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tagCloudData.slice(0, 6)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" style={{ fontSize: '10px' }} />
              <YAxis dataKey="tag" type="category" width={80} style={{ fontSize: '10px' }} />
              <Tooltip />
              <Bar dataKey="count" fill="#EF4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
          {tagCloudData.slice(0, 8).map((item, idx) => (
            <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
              {item.tag} · {item.count}
            </span>
          ))}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-3">
        {/* Title Patterns */}
        <div className="bg-white border border-gray-200 rounded p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs font-medium text-gray-900">爆款标题公式</span>
          </div>
          <div className="space-y-1.5">
            {titlePatterns.map((pattern, idx) => (
              <div key={idx} className="p-2 bg-gray-50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-900">{pattern.pattern}</span>
                  <span className="text-xs text-gray-500">{pattern.count}次</span>
                </div>
                <p className="text-xs text-gray-600 line-clamp-1">{pattern.example}</p>
              </div>
            ))}
          </div>
        </div>

        {/* User Insights */}
        <div className="bg-white border border-gray-200 rounded p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <MessageCircle className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs font-medium text-gray-900">用户心声</span>
          </div>
          <div className="space-y-1.5">
            {userInsights.map((insight, idx) => (
              <div key={idx} className="p-2 bg-gray-50 rounded border-l-2 border-red-500">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-gray-900">{insight.type}</span>
                  <span className="text-xs text-gray-500">{insight.count}条</span>
                </div>
                <p className="text-xs text-gray-600">{insight.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Captured Notes - Top 2 */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="w-3.5 h-3.5 text-gray-700" />
          <span className="text-xs font-medium text-gray-900">热门笔记</span>
        </div>
        {loading ? (
          <div className="text-xs text-gray-500 text-center py-4">加载中...</div>
        ) : topics.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-4">暂无数据，请先抓取笔记</div>
        ) : (
          <div className="space-y-2">
            {topics.slice(0, 2).map((topic) => (
              <a
                key={topic.id}
                href={topic.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              >
                {topic.cover_url && (
                  <img
                    src={topic.cover_url}
                    alt={topic.title}
                    className="w-16 h-16 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 mb-0.5 line-clamp-1">{topic.title}</div>
                  <div className="text-xs text-gray-500 mb-1">{topic.author_name} · {topic.keyword}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-0.5">
                      <Heart className="w-3 h-3" />
                      {formatCount(topic.like_count || 0)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Star className="w-3 h-3" />
                      {formatCount(topic.collect_count || 0)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MessageCircle className="w-3 h-3" />
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
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="text-xs font-medium text-gray-900 mb-2">全部笔记 ({topics.length})</div>
        {loading ? (
          <div className="text-xs text-gray-500 text-center py-4">加载中...</div>
        ) : topics.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-4">暂无数据</div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {topics.slice(0, 8).map((topic) => (
              <a
                key={topic.id}
                href={topic.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group cursor-pointer"
              >
                <div className="relative mb-1.5 overflow-hidden rounded bg-gray-100">
                  {topic.cover_url ? (
                    <img
                      src={topic.cover_url}
                      alt={topic.title}
                      className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-28 flex items-center justify-center text-gray-400 text-xs">无封面</div>
                  )}
                  <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded flex items-center gap-0.5">
                    <Heart className="w-2.5 h-2.5" />
                    {formatCount(topic.like_count || 0)}
                  </div>
                </div>
                <div className="text-xs font-medium text-gray-900 mb-0.5 line-clamp-2 group-hover:text-red-500 transition-colors">
                  {topic.title}
                </div>
                <div className="text-xs text-gray-500 mb-1">{topic.author_name}</div>
                {topic.keyword && (
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
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
