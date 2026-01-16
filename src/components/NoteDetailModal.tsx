import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Heart, Star, MessageCircle, Share2, Edit2, Trash2 } from 'lucide-react';

export interface NoteDetailData {
  id: string;
  title: string;
  desc: string;
  images: string[];
  user?: {
    nickname: string;
    avatar: string;
  };
  interactInfo?: {
    likedCount: string | number;
    collectedCount: string | number;
    commentCount: string | number;
  };
  tags?: string[];
  time?: number;
}

interface NoteDetailModalProps {
  note: NoteDetailData | null;
  open: boolean;
  onClose: () => void;
  editable?: boolean;
  onSave?: (data: NoteDetailData) => void;
  hideSocialFeatures?: boolean;
}

export function NoteDetailModal({ note, open, onClose, editable, onSave, hideSocialFeatures }: NoteDetailModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<NoteDetailData | null>(null);

  // Reset image index when note changes
  useEffect(() => {
    setCurrentImageIndex(0);
    setIsEditing(false);
    setEditData(null);
  }, [note?.id]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentImageIndex, note?.images.length]);

  const nextImage = useCallback(() => {
    if (!note) return;
    setCurrentImageIndex((prev) => (prev + 1) % note.images.length);
  }, [note]);

  const prevImage = useCallback(() => {
    if (!note) return;
    setCurrentImageIndex((prev) => (prev - 1 + note.images.length) % note.images.length);
  }, [note]);

  if (!open || !note) return null;

  const displayData = isEditing && editData ? editData : note;

  const startEditing = () => {
    setEditData({ ...note, images: [...note.images], tags: [...(note.tags || [])] });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData(null);
  };

  const handleSave = () => {
    if (editData && onSave) {
      onSave(editData);
    }
    setIsEditing(false);
    setEditData(null);
  };

  const deleteImage = (idx: number) => {
    if (!editData) return;
    const newImages = editData.images.filter((_, i) => i !== idx);
    setEditData({ ...editData, images: newImages });
    if (currentImageIndex >= newImages.length) {
      setCurrentImageIndex(Math.max(0, newImages.length - 1));
    }
  };

  const formatCount = (count: string | number) => {
    const num = typeof count === 'string' ? parseInt(count, 10) : count;
    if (isNaN(num)) return count;
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-[90vw] max-w-[1000px] h-[85vh] max-h-[700px] bg-white rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Left: Image Carousel */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-w-0">
          {displayData.images.length > 0 ? (
            <>
              <img
                src={displayData.images[currentImageIndex]}
                alt={displayData.title}
                className="max-w-full max-h-full object-contain"
              />

              {/* Delete button in edit mode */}
              {isEditing && (
                <button
                  onClick={() => deleteImage(currentImageIndex)}
                  className="absolute top-4 left-4 p-2 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              )}

              {/* Navigation arrows */}
              {displayData.images.length > 1 && (
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
              {displayData.images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {displayData.images.map((_, idx) => (
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

              {/* Image counter */}
              {displayData.images.length > 1 && (
                <div className="absolute top-4 right-4 px-2 py-1 bg-black/50 rounded-full text-white text-xs">
                  {currentImageIndex + 1} / {displayData.images.length}
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-400 text-sm">暂无图片</div>
          )}
        </div>

        {/* Right: Content */}
        <div className="w-[360px] flex flex-col bg-white">
          {/* Header with edit button */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            {!hideSocialFeatures && note.user && (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <img
                  src={note.user.avatar || '/default-avatar.png'}
                  alt={note.user.nickname}
                  className="w-10 h-10 rounded-full object-cover bg-gray-100"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="%23f3f4f6" width="40" height="40"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="16">👤</text></svg>';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {note.user.nickname}
                  </div>
                  {note.time && (
                    <div className="text-xs text-gray-400">{formatTime(note.time)}</div>
                  )}
                </div>
              </div>
            )}
            {(hideSocialFeatures || !note.user) && (
              <div className="text-sm font-medium text-gray-700">素材详情</div>
            )}
            {editable && !isEditing && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                编辑
              </button>
            )}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isEditing && editData ? (
              <>
                {/* Edit form */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">标题</label>
                  <input
                    type="text"
                    value={editData.title}
                    onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">正文</label>
                  <textarea
                    value={editData.desc}
                    onChange={(e) => setEditData({ ...editData, desc: e.target.value })}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">标签</label>
                  <div className="flex flex-wrap gap-2">
                    {editData.tags?.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
                      >
                        #{tag}
                        <button
                          onClick={() => {
                            const newTags = editData.tags?.filter((_, i) => i !== idx);
                            setEditData({ ...editData, tags: newTags });
                          }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Title */}
                <h2 className="text-base font-semibold text-gray-900 leading-relaxed">
                  {displayData.title}
                </h2>

                {/* Description */}
                {displayData.desc && (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {displayData.desc}
                  </p>
                )}

                {/* Tags */}
                {displayData.tags && displayData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {displayData.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom bar */}
          {isEditing ? (
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-100">
              <button
                onClick={cancelEditing}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
          ) : !hideSocialFeatures && note.interactInfo ? (
            <div className="flex items-center justify-around p-4 border-t border-gray-100">
              <button className="flex items-center gap-1.5 text-gray-600 hover:text-red-500 transition-colors">
                <Heart className="w-5 h-5" />
                <span className="text-sm">{formatCount(note.interactInfo.likedCount)}</span>
              </button>
              <button className="flex items-center gap-1.5 text-gray-600 hover:text-yellow-500 transition-colors">
                <Star className="w-5 h-5" />
                <span className="text-sm">{formatCount(note.interactInfo.collectedCount)}</span>
              </button>
              <button className="flex items-center gap-1.5 text-gray-600 hover:text-blue-500 transition-colors">
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm">{formatCount(note.interactInfo.commentCount)}</span>
              </button>
              <button className="flex items-center gap-1.5 text-gray-600 hover:text-green-500 transition-colors">
                <Share2 className="w-5 h-5" />
                <span className="text-sm">分享</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
