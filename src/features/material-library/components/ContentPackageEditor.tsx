import { useState } from 'react';
import { X, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import type { ContentPackage } from '../types';

interface ContentPackageEditorProps {
  pkg: ContentPackage;
  onClose: () => void;
  onSave: (pkg: ContentPackage) => void;
}

export function ContentPackageEditor({ pkg, onClose, onSave }: ContentPackageEditorProps) {
  const [editedPkg, setEditedPkg] = useState<ContentPackage>(pkg);
  const [newTag, setNewTag] = useState('');

  const handleAddTitle = () => {
    setEditedPkg({
      ...editedPkg,
      titles: [...editedPkg.titles, '新标题'],
    });
  };

  const handleUpdateTitle = (index: number, value: string) => {
    const newTitles = [...editedPkg.titles];
    newTitles[index] = value;
    setEditedPkg({ ...editedPkg, titles: newTitles });
  };

  const handleDeleteTitle = (index: number) => {
    if (editedPkg.titles.length <= 1) return;
    const newTitles = editedPkg.titles.filter((_, i) => i !== index);
    setEditedPkg({
      ...editedPkg,
      titles: newTitles,
      selectedTitleIndex: Math.min(editedPkg.selectedTitleIndex, newTitles.length - 1),
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editedPkg.tags.includes(newTag.trim())) {
      setEditedPkg({
        ...editedPkg,
        tags: [...editedPkg.tags, newTag.trim()],
      });
      setNewTag('');
    }
  };

  const handleDeleteTag = (tag: string) => {
    setEditedPkg({
      ...editedPkg,
      tags: editedPkg.tags.filter(t => t !== tag),
    });
  };

  const handleSave = () => {
    onSave(editedPkg);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">编辑内容包</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Cover Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">封面图</label>
              <div className="relative h-48 bg-gray-100 rounded-lg overflow-hidden">
                {editedPkg.coverImage ? (
                  <img
                    src={editedPkg.coverImage}
                    alt="封面"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <ImageIcon className="w-16 h-16 text-gray-300" />
                  </div>
                )}
                <button className="absolute top-2 right-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm text-sm rounded hover:bg-white transition-colors">
                  更换图片
                </button>
              </div>
            </div>

            {/* Titles */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">标题</label>
                <button
                  onClick={handleAddTitle}
                  className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  添加标题
                </button>
              </div>
              <div className="space-y-2">
                {editedPkg.titles.map((title, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={title}
                        onChange={e => handleUpdateTitle(index, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder={`标题 ${index + 1}`}
                      />
                    </div>
                    {editedPkg.titles.length > 1 && (
                      <button
                        onClick={() => handleDeleteTitle(index)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                当前选中：标题 {editedPkg.selectedTitleIndex + 1}
              </p>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">正文内容</label>
              <textarea
                value={editedPkg.content}
                onChange={e => setEditedPkg({ ...editedPkg, content: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                placeholder="输入正文内容..."
              />
              <p className="mt-1 text-xs text-gray-500">{editedPkg.content.length} 字符</p>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">标签</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {editedPkg.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm flex items-center gap-1 group"
                  >
                    #{tag}
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-gray-500 hover:text-red-600" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleAddTag()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="添加标签..."
                />
                <button
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                >
                  添加
                </button>
              </div>
            </div>

            {/* Image Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">图片模型</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditedPkg({ ...editedPkg, imageModel: 'nanobanana' })}
                  className={`px-4 py-2 rounded border transition-colors ${
                    editedPkg.imageModel === 'nanobanana'
                      ? 'bg-red-50 border-red-500 text-red-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  NanoBanana
                </button>
                <button
                  onClick={() => setEditedPkg({ ...editedPkg, imageModel: 'jimeng' })}
                  className={`px-4 py-2 rounded border transition-colors ${
                    editedPkg.imageModel === 'jimeng'
                      ? 'bg-red-50 border-red-500 text-red-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  即梦
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}
