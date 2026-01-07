import { useState } from 'react';
import { Plus, Search, Trash2, Play, Pause, CheckCircle } from 'lucide-react';
import type { Theme } from '../App';

interface ThemeManagerProps {
  themes: Theme[];
  onCreateTheme: (theme: Omit<Theme, 'id' | 'createdAt'>) => void;
  onSelectTheme: (theme: Theme) => void;
  onDeleteTheme: (themeId: string) => void;
  onUpdateTheme: (theme: Theme) => void;
}

export function ThemeManager({
  themes,
  onCreateTheme,
  onSelectTheme,
  onDeleteTheme,
  onUpdateTheme
}: ThemeManagerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    keywords: '',
    competitors: '',
    status: 'active' as Theme['status']
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateTheme({
      name: formData.name,
      description: formData.description,
      keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
      competitors: formData.competitors.split(',').map(c => c.trim()).filter(Boolean),
      status: formData.status
    });
    setFormData({
      name: '',
      description: '',
      keywords: '',
      competitors: '',
      status: 'active'
    });
    setShowCreateModal(false);
  };

  const filteredThemes = themes.filter(theme =>
    theme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    theme.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleStatus = (theme: Theme) => {
    const newStatus = theme.status === 'active' ? 'paused' : 'active';
    onUpdateTheme({ ...theme, status: newStatus });
  };

  const getStatusColor = (status: Theme['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'paused':
        return 'bg-yellow-100 text-yellow-700';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
    }
  };

  const getStatusIcon = (status: Theme['status']) => {
    switch (status) {
      case 'active':
        return <Play className="w-3 h-3" />;
      case 'paused':
        return <Pause className="w-3 h-3" />;
      case 'completed':
        return <CheckCircle className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">主题管理中心</h2>
          <p className="text-gray-600 mt-1">创建和管理您的运营主题</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>新建主题</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="搜索主题名称或描述..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {/* Theme Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredThemes.map((theme) => (
          <div
            key={theme.id}
            className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-xl transition-all cursor-pointer group"
            onClick={() => onSelectTheme(theme)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 mb-2 group-hover:text-red-500 transition-colors">
                  {theme.name}
                </h3>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getStatusColor(theme.status)}`}>
                  {getStatusIcon(theme.status)}
                  <span>
                    {theme.status === 'active' ? '运营中' : theme.status === 'paused' ? '已暂停' : '已完成'}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{theme.description}</p>

            <div className="space-y-3 mb-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">关键词</div>
                <div className="flex flex-wrap gap-1">
                  {theme.keywords.slice(0, 3).map((keyword, idx) => (
                    <span key={idx} className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded-lg">
                      {keyword}
                    </span>
                  ))}
                  {theme.keywords.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg">
                      +{theme.keywords.length - 3}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">竞品账号</div>
                <div className="text-sm text-gray-700">
                  {theme.competitors.length > 0 ? `${theme.competitors.length} 个账号` : '未设置'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-500">创建于 {theme.createdAt}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatus(theme);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title={theme.status === 'active' ? '暂停主题' : '启动主题'}
                >
                  {theme.status === 'active' ? (
                    <Pause className="w-4 h-4 text-gray-600" />
                  ) : (
                    <Play className="w-4 h-4 text-gray-600" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('确定要删除这个主题吗？')) {
                      onDeleteTheme(theme.id);
                    }
                  }}
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredThemes.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-10 h-10 text-gray-400" />
          </div>
          <p className="text-gray-500">
            {searchQuery ? '未找到匹配的主题' : '暂无主题，点击"新建主题"开始'}
          </p>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">创建新主题</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  主题名称 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：2024夏季防晒攻略"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  主题描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简要描述这个主题的目标和方向..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  关键词
                </label>
                <input
                  type="text"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="用逗号分隔，例如：防晒, 夏季护肤, 防晒霜测评"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="text-xs text-gray-500 mt-1">系统将基于这些关键词搜索相关笔记</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  竞品账号
                </label>
                <input
                  type="text"
                  value={formData.competitors}
                  onChange={(e) => setFormData({ ...formData, competitors: e.target.value })}
                  placeholder="用逗号分隔，例如：美妆博主A, 护肤达人B"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="text-xs text-gray-500 mt-1">系统将监控这些账号的最新动态</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl hover:shadow-lg transition-all"
                >
                  创建主题
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
