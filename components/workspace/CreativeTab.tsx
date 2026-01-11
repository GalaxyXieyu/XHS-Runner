import { useEffect, useMemo, useState } from 'react';
import { Check, Edit2, RefreshCw, Search, X } from 'lucide-react';
import { Theme } from '../../App';

interface CreativeItem {
  id: number;
  title: string;
  content: string;
  tags: string[];
  status: 'draft' | 'ready' | 'published';
  createdAt: string;
}

interface CreativeTabProps {
  theme: Theme;
}

function normalizeCreative(row: any): CreativeItem {
  return {
    id: row.id,
    title: row.title || '未命名内容包',
    content: row.content || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status || 'draft',
    createdAt: row.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
  };
}

export function CreativeTab({ theme }: CreativeTabProps) {
  const [creatives, setCreatives] = useState<CreativeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<CreativeItem | null>(null);
  const [editForm, setEditForm] = useState({ content: '', tags: '' });

  const loadCreatives = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/creatives?themeId=${theme.id}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data.map(normalizeCreative) : [];
      setCreatives(list);
    } catch (error) {
      console.error('Failed to load creatives:', error);
      setCreatives([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCreatives();
  }, [theme.id]);

  const filteredCreatives = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return creatives;
    return creatives.filter(item =>
      item.title.toLowerCase().includes(keyword) ||
      item.content.toLowerCase().includes(keyword)
    );
  }, [creatives, searchQuery]);

  const handleEdit = (item: CreativeItem) => {
    setEditing(item);
    setEditForm({
      content: item.content,
      tags: item.tags.join(', ')
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    const payload = {
      content: editForm.content,
      tags: editForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
    };
    try {
      await fetch(`/api/creatives/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await loadCreatives();
      setEditing(null);
    } catch (error) {
      console.error('Failed to update creative:', error);
    }
  };

  const handleToggleStatus = async (item: CreativeItem) => {
    const nextStatus = item.status === 'ready' ? 'draft' : 'ready';
    try {
      await fetch(`/api/creatives/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      await loadCreatives();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索内容包..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          <button
            onClick={loadCreatives}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-xs hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {loading ? '刷新中' : '刷新'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {filteredCreatives.length === 0 && (
          <div className="bg-white border border-dashed border-gray-200 rounded p-6 text-center text-xs text-gray-400">
            暂无内容包
          </div>
        )}
        {filteredCreatives.map((item) => (
          <div key={item.id} className="bg-white border border-gray-200 rounded p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-gray-900">{item.title}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{item.createdAt}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleStatus(item)}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    item.status === 'ready'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {item.status === 'ready' ? '已就绪' : '草稿'}
                </button>
                <button
                  onClick={() => handleEdit(item)}
                  className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  编辑
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-2 line-clamp-2">{item.content || '暂无正文'}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {item.tags.length === 0 && (
                <span className="text-[11px] text-gray-400">暂无标签</span>
              )}
              {item.tags.map((tag, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 max-w-lg w-full space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900">编辑内容包</div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-gray-700">正文</label>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                rows={6}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-gray-700">标签</label>
              <input
                type="text"
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                placeholder="用逗号分隔，例如：防晒, 种草"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors inline-flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
