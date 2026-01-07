import { useState } from 'react';
import { TrendingUp, Hash, MessageCircle, RefreshCw, Eye, Heart, Star, Users } from 'lucide-react';
import type { Theme } from '../../App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface InsightTabProps {
  theme: Theme;
}

// Mock data
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

const competitorNotes = [
  {
    id: '1',
    author: '美妆博主A',
    title: '2024最火的10款防晒霜测评',
    publishTime: '2小时前',
    views: 12500,
    likes: 856,
    comments: 234,
    thumbnail: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400'
  },
  {
    id: '2',
    author: '护肤达人B',
    title: '夏天必备！学生党平价防晒推荐',
    publishTime: '5小时前',
    views: 8900,
    likes: 623,
    comments: 156,
    thumbnail: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400'
  }
];

const mockNotes = [
  {
    id: '1',
    title: '夏季防晒霜大测评！这3款真的绝了',
    author: '护肤小能手',
    views: 15600,
    likes: 1234,
    comments: 456,
    publishTime: '3天前',
    thumbnail: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400',
    tags: ['#防晒', '#夏季护肤']
  },
  {
    id: '2',
    title: '千万别买！防晒霜踩雷合集',
    author: '美妆达人',
    views: 23400,
    likes: 2100,
    comments: 789,
    publishTime: '5天前',
    thumbnail: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400',
    tags: ['#防晒霜', '#避雷']
  },
  {
    id: '3',
    title: '学生党必看！平价防晒推荐',
    author: '学生党小姐姐',
    views: 18900,
    likes: 1567,
    comments: 345,
    publishTime: '1周前',
    thumbnail: 'https://images.unsplash.com/photo-1571875257727-256c39da42af?w=400',
    tags: ['#学生党', '#平价']
  },
  {
    id: '4',
    title: '敏感肌防晒推荐｜温和不刺激',
    author: '敏感肌救星',
    views: 12300,
    likes: 987,
    comments: 234,
    publishTime: '1周前',
    thumbnail: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400',
    tags: ['#敏感肌', '#防晒']
  }
];

export function InsightTab({ theme }: InsightTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">抓取笔记</span>
            <TrendingUp className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">1,234</div>
          <div className="text-xs text-gray-500">本周 +186</div>
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

      {/* Competitor Updates */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="w-3.5 h-3.5 text-gray-700" />
          <span className="text-xs font-medium text-gray-900">竞品动态</span>
        </div>
        <div className="space-y-2">
          {competitorNotes.map((note) => (
            <div key={note.id} className="flex gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer">
              <img
                src={note.thumbnail}
                alt={note.title}
                className="w-16 h-16 object-cover rounded flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 mb-0.5 line-clamp-1">{note.title}</div>
                <div className="text-xs text-gray-500 mb-1">{note.author} · {note.publishTime}</div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="flex items-center gap-0.5">
                    <Eye className="w-3 h-3" />
                    {(note.views / 1000).toFixed(1)}k
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Heart className="w-3 h-3" />
                    {note.likes}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <MessageCircle className="w-3 h-3" />
                    {note.comments}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes Grid */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="text-xs font-medium text-gray-900 mb-2">热门笔记</div>
        <div className="grid grid-cols-4 gap-2">
          {mockNotes.map((note) => (
            <div key={note.id} className="group cursor-pointer">
              <div className="relative mb-1.5 overflow-hidden rounded">
                <img
                  src={note.thumbnail}
                  alt={note.title}
                  className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Eye className="w-2.5 h-2.5" />
                  {(note.views / 1000).toFixed(1)}k
                </div>
              </div>
              <div className="text-xs font-medium text-gray-900 mb-0.5 line-clamp-2 group-hover:text-red-500 transition-colors">
                {note.title}
              </div>
              <div className="text-xs text-gray-500 mb-1">{note.author}</div>
              <div className="flex gap-1">
                {note.tags.slice(0, 2).map((tag, idx) => (
                  <span key={idx} className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
