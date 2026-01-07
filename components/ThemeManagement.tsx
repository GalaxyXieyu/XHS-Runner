import { useState } from 'react';
import { Plus, Search, MoreVertical, Play, Pause, Archive, Trash2, Edit2, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Theme } from '../App';
import { InsightTab } from './workspace/InsightTab';

interface ThemeManagementProps {
  themes: Theme[];
  setThemes: (themes: Theme[]) => void;
  selectedTheme: Theme | null;
  setSelectedTheme: (theme: Theme | null) => void;
}

export function ThemeManagement({ themes, setThemes, selectedTheme, setSelectedTheme }: ThemeManagementProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    keywords: '',
    competitors: '',
    status: 'active' as Theme['status']
  });

  // 默认选择第一个主题
  if (!selectedTheme && themes.length > 0) {
    setSelectedTheme(themes[0]);
  }

  const handleCreateTheme = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTheme) {
      // 编辑模式
      const updatedThemes = themes.map(t =>
        t.id === editingTheme.id
          ? {
              ...t,
              name: formData.name,
              description: formData.description,
              keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
              competitors: formData.competitors.split(',').map(c => c.trim()).filter(Boolean),
              status: formData.status
            }
          : t
      );
      setThemes(updatedThemes);
      if (selectedTheme?.id === editingTheme.id) {
        setSelectedTheme(updatedThemes.find(t => t.id === editingTheme.id) || null);
      }
    } else {
      // 新建模式
      const newTheme: Theme = {
        id: Date.now().toString(),
        name: formData.name,
        description: formData.description,
        keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
        competitors: formData.competitors.split(',').map(c => c.trim()).filter(Boolean),
        status: formData.status,
        createdAt: new Date().toISOString().split('T')[0]
      };
      setThemes([...themes, newTheme]);
      setSelectedTheme(newTheme);
    }
    setFormData({
      name: '',
      description: '',
      keywords: '',
      competitors: '',
      status: 'active'
    });
    setShowCreateModal(false);
    setEditingTheme(null);
  };

  const handleDeleteTheme = (id: string) => {
    if (confirm('确定要删除这个主题吗？')) {
      const newThemes = themes.filter(t => t.id !== id);
      setThemes(newThemes);
      if (selectedTheme?.id === id) {
        setSelectedTheme(newThemes[0] || null);
      }
    }
  };

  const handleUpdateStatus = (id: string, status: Theme['status']) => {
    const updatedThemes = themes.map(t => t.id === id ? { ...t, status } : t);
    setThemes(updatedThemes);
    if (selectedTheme?.id === id) {
      setSelectedTheme(updatedThemes.find(t => t.id === id) || null);
    }
  };

  const handleEditTheme = (theme: Theme) => {
    setEditingTheme(theme);
    setFormData({
      name: theme.name,
      description: theme.description,
      keywords: theme.keywords.join(', '),
      competitors: theme.competitors.join(', '),
      status: theme.status
    });
    setShowCreateModal(true);
  };

  const filteredThemes = themes.filter(theme =>
    theme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    theme.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const statusConfig = {
    active: { label: '运营中', color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50' },
    paused: { label: '已暂停', color: 'bg-yellow-500', textColor: 'text-yellow-700', bgColor: 'bg-yellow-50' },
    completed: { label: '已完成', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50' }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Theme Selector - Top Collapsible Panel */}
      <div className="bg-white border-b border-gray-200">
        {/* Collapsed View */}
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded transition-colors"
            >
              {selectedTheme ? (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${statusConfig[selectedTheme.status].color}`}></div>
                  <span className="text-xs font-medium text-gray-900">{selectedTheme.name}</span>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span>{selectedTheme.keywords.length} 关键词</span>
                    <span>·</span>
                    <span>{selectedTheme.competitors.length} 竞品</span>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-gray-500">选择主题</span>
              )}
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              )}
            </button>
            
            {selectedTheme && !isExpanded && (
              <div className="flex flex-wrap gap-1">
                {selectedTheme.keywords.slice(0, 5).map((keyword, idx) => (
                  <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                    {keyword}
                  </span>
                ))}
                {selectedTheme.keywords.length > 5 && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                    +{selectedTheme.keywords.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setEditingTheme(null);
              setFormData({
                name: '',
                description: '',
                keywords: '',
                competitors: '',
                status: 'active'
              });
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新建主题
          </button>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-3 bg-gray-50">
            <div className="max-w-6xl mx-auto">
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索主题..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {filteredThemes.map((theme) => (
                  <div
                    key={theme.id}
                    className={`group relative p-3 rounded border cursor-pointer transition-all ${
                      selectedTheme?.id === theme.id
                        ? 'bg-red-50 border-red-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setSelectedTheme(theme);
                      setIsExpanded(false);
                    }}
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${statusConfig[theme.status].color}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 mb-0.5 truncate">{theme.name}</div>
                        <div className="text-xs text-gray-500 line-clamp-2">{theme.description}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                      <span>{theme.keywords.length} 关键词</span>
                      <span>·</span>
                      <span>{theme.competitors.length} 竞品</span>
                      <span>·</span>
                      <span className={`px-1.5 py-0.5 rounded ${statusConfig[theme.status].bgColor} ${statusConfig[theme.status].textColor}`}>
                        {statusConfig[theme.status].label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="relative group/menu">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <div className="hidden group-hover/menu:block absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg py-1 z-10 min-w-[120px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditTheme(theme);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                          >
                            <Edit2 className="w-3 h-3" />
                            编辑
                          </button>
                          {theme.status === 'active' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(theme.id, 'paused');
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                            >
                              <Pause className="w-3 h-3" />
                              暂停
                            </button>
                          )}
                          {theme.status === 'paused' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(theme.id, 'active');
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                            >
                              <Play className="w-3 h-3" />
                              继续
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateStatus(theme.id, 'completed');
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                          >
                            <Archive className="w-3 h-3" />
                            归档
                          </button>
                          <div className="border-t border-gray-100 my-1"></div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTheme(theme.id);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {filteredThemes.length === 0 && (
                  <div className="col-span-full text-center py-8">
                    <div className="text-xs text-gray-400">暂无主题</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insight Analysis Content */}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {selectedTheme ? (
          <div className="p-4">
            <InsightTab theme={selectedTheme} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <div className="text-sm text-gray-600 mb-2">请选择一个主题查看洞察分析</div>
              <button
                onClick={() => setIsExpanded(true)}
                className="text-xs text-red-500 hover:text-red-600"
              >
                选择主题
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Theme Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 max-w-md w-full">
            <div className="text-sm font-medium text-gray-900 mb-3">
              {editingTheme ? '编辑主题' : '创建新主题'}
            </div>
            <form onSubmit={handleCreateTheme} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1">主题名称 *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：2024夏季防晒攻略"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">主题描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简要描述这个主题..."
                  rows={2}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">关键词</label>
                <input
                  type="text"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="用逗号分隔，例如：防晒, 夏季护肤"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">竞品账号</label>
                <input
                  type="text"
                  value={formData.competitors}
                  onChange={(e) => setFormData({ ...formData, competitors: e.target.value })}
                  placeholder="用逗号分隔，例如：美妆博主A, 护肤达人B"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Theme['status'] })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="active">运营中</option>
                  <option value="paused">已暂停</option>
                  <option value="completed">已完成</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingTheme(null);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  {editingTheme ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
