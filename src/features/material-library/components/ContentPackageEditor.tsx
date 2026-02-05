import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import type { ContentPackage } from '../types';

interface ContentPackageEditorProps {
  pkg: ContentPackage;
  onClose: () => void;
  onSave: (pkg: ContentPackage) => void;
}

export function ContentPackageEditor({ pkg, onClose, onSave }: ContentPackageEditorProps) {
  const [editedPkg, setEditedPkg] = useState<ContentPackage>(pkg);
  const [newTag, setNewTag] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = editedPkg.images || (editedPkg.coverImage ? [editedPkg.coverImage] : []);

  // Keyboard navigation for images
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) {
        setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length);
      }
      if (e.key === 'ArrowRight' && images.length > 1) {
        setCurrentImageIndex(prev => (prev + 1) % images.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

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

  const handleSelectTitle = (index: number) => {
    setEditedPkg({ ...editedPkg, selectedTitleIndex: index });
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

  const handleDeleteImage = useCallback((index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setEditedPkg(prev => ({
      ...prev,
      images: newImages,
      coverImage: newImages[0] || undefined,
    }));
    if (currentImageIndex >= newImages.length) {
      setCurrentImageIndex(Math.max(0, newImages.length - 1));
    }
  }, [images, currentImageIndex]);

  const handleSave = () => {
    onSave(editedPkg);
    onClose();
  };

  const nextImage = () => {
    if (images.length > 1) {
      setCurrentImageIndex(prev => (prev + 1) % images.length);
    }
  };

  const prevImage = () => {
    if (images.length > 1) {
      setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-[90vw] max-w-[1000px] h-[85vh] max-h-[700px] overflow-hidden flex shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Left: Image Carousel */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-w-0">
          {images.length > 0 ? (
            <>
              <img
                src={images[currentImageIndex]}
                alt="内容图片"
                className="max-w-full max-h-full object-contain"
              />

              {/* Navigation arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-3 p-2 bg-black/30 hover:bg-black/50 rounded-full transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6 text-white" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-3 p-2 bg-black/30 hover:bg-black/50 rounded-full transition-colors"
                  >
                    <ChevronRight className="w-6 h-6 text-white" />
                  </button>
                </>
              )}

              {/* Dot indicators */}
              {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === currentImageIndex
                          ? 'bg-white w-4'
                          : 'bg-white/50 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Image counter & delete */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                {images.length > 1 && (
                  <span className="px-2 py-1 bg-black/50 rounded-full text-white text-xs">
                    {currentImageIndex + 1} / {images.length}
                  </span>
                )}
                {images.length > 0 && (
                  <button
                    onClick={() => handleDeleteImage(currentImageIndex)}
                    className="p-1.5 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors"
                    title="删除当前图片"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>

              {/* Add image button */}
              <button className="absolute bottom-4 right-4 px-3 py-1.5 bg-white/90 hover:bg-white rounded-lg text-sm flex items-center gap-1.5 transition-colors">
                <Upload className="w-4 h-4" />
                添加图片
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400">
              <Upload className="w-16 h-16 mb-3" />
              <span className="text-sm">暂无图片</span>
              <button className="mt-3 px-4 py-2 bg-white/90 hover:bg-white rounded-lg text-sm text-gray-700 transition-colors">
                上传图片
              </button>
            </div>
          )}
        </div>

        {/* Right: Edit Panel */}
        <div className="w-[380px] flex flex-col bg-white">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="text-base font-medium text-gray-900">编辑内容包</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Titles */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">标题</label>
                <button
                  onClick={handleAddTitle}
                  className="text-xs text-red-600 hover:text-red-700 flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加
                </button>
              </div>
              <div className="space-y-2">
                {editedPkg.titles.map((title, index) => (
                  <div
                    key={index}
                    className={`flex gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
                      editedPkg.selectedTitleIndex === index
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleSelectTitle(index)}
                  >
                    <input
                      type="text"
                      value={title}
                      onChange={e => handleUpdateTitle(index, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-sm bg-transparent focus:outline-none"
                      placeholder={`标题 ${index + 1}`}
                    />
                    {editedPkg.titles.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTitle(index);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">正文内容</label>
              <textarea
                value={editedPkg.content}
                onChange={e => setEditedPkg({ ...editedPkg, content: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none"
                placeholder="输入正文内容..."
              />
              <p className="mt-1 text-xs text-gray-400 text-right">{editedPkg.content.length} 字符</p>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">标签</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editedPkg.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs flex items-center gap-1 group"
                  >
                    #{tag}
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
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
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  placeholder="添加标签..."
                />
                <button
                  onClick={handleAddTag}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                >
                  添加
                </button>
              </div>
            </div>

            {/* Image Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">图片模型</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditedPkg({ ...editedPkg, imageModel: 'nanobanana' })}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    editedPkg.imageModel === 'nanobanana'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  NanoBanana
                </button>
                <button
                  onClick={() => setEditedPkg({ ...editedPkg, imageModel: 'jimeng' })}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    editedPkg.imageModel === 'jimeng'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  即梦 4.0
                </button>
                <button
                  onClick={() => setEditedPkg({ ...editedPkg, imageModel: 'jimeng-45' })}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    editedPkg.imageModel === 'jimeng-45'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  即梦 4.5
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
