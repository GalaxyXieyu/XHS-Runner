import { useState } from 'react';
import { ArrowLeft, FileText, Image as ImageIcon, Video, Sparkles, Copy, Check, Edit2, Save, X, RefreshCw, Wand2, Upload, Trash2, Plus } from 'lucide-react';
import type { Theme } from '@/App';
import type { Content } from '../types';

interface ContentDetailProps {
  content: Content;
  theme: Theme;
  onBack: () => void;
  onUpdate: (content: Content) => void;
}

export function ContentDetail({ content, theme, onBack, onUpdate }: ContentDetailProps) {
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingTitleIndex, setEditingTitleIndex] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState(false);
  const [selectedImages, setSelectedImages] = useState<number[]>([0]);
  
  // Mock data - 生成的标题变体
  const [titleVariants, setTitleVariants] = useState([
    '千万别忽这些防晒霜！ 2024最避雷指南',
    '🔥千万别踩雷！2024最全防晒避雷指南来了',
    '姐妹们！这些防晒真的别买！血泪教训分享',
    '防晒避雷｜2024年最不值得买的10款防晒',
    '学生党必看！50元以下超好用的平价防晒',
    '💰省钱攻略｜这些平价防晒比大牌还好用',
    '实测！20款防晒霜对比，这几款真的绝了',
    '夏天必备｜油皮干皮都适用的防晒推荐'
  ]);

  const [tempTitleEdit, setTempTitleEdit] = useState('');

  // Mock data - 生成的正文内容
  const [bodyContent, setBodyContent] = useState(`姐妹们！作为一个踩过无数防晒雷的老人，今天必须跟大家分享这些被网红吹爆但其实...

【避雷清单】
❌ XX防晒霜 - 搓泥严重，用完脸上像掉了一层皮
❌ XX防晒喷雾 - 成膜慢，还容易花妆
❌ XX防晒乳 - 太油了，油皮姐妹千万别碰

【推荐清单】
✅ XX防晒霜 - 清爽不油腻，适合油皮
✅ XX防晒乳 - 保湿效果好，干皮救星
✅ XX防晒喷雾 - 补防晒神器，方便携带

记得点赞收藏哦～有问题评论区见！`);

  // Mock data - 图片/封面
  const [imageVariants, setImageVariants] = useState([
    { id: 1, url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop' },
    { id: 2, url: 'https://images.unsplash.com/photo-1570554886111-e80fcca6a029?w=400&h=400&fit=crop' },
    { id: 3, url: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&h=400&fit=crop' }
  ]);

  const handleCopyTitle = (title: string, index: number) => {
    navigator.clipboard.writeText(title);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSaveTitle = (index: number) => {
    if (tempTitleEdit.trim()) {
      const newVariants = [...titleVariants];
      newVariants[index] = tempTitleEdit;
      setTitleVariants(newVariants);
    }
    setEditingTitleIndex(null);
    setTempTitleEdit('');
  };

  const handleDeleteTitle = (index: number) => {
    if (titleVariants.length > 1) {
      setTitleVariants(titleVariants.filter((_, i) => i !== index));
      if (selectedTitle === index) {
        setSelectedTitle(0);
      }
    }
  };

  const handleDeleteImage = (id: number) => {
    setImageVariants(imageVariants.filter(img => img.id !== id));
    setSelectedImages(selectedImages.filter(imgId => imgId !== id));
  };

  const toggleImageSelection = (id: number) => {
    if (selectedImages.includes(id)) {
      setSelectedImages(selectedImages.filter(imgId => imgId !== id));
    } else {
      setSelectedImages([...selectedImages, id]);
    }
  };

  const typeConfig = {
    article: { label: '图文', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    image: { label: '图片', icon: ImageIcon, color: 'text-green-600', bg: 'bg-green-50' },
    video: { label: '视频', icon: Video, color: 'text-purple-600', bg: 'bg-purple-50' }
  };

  const config = typeConfig[content.type];
  const Icon = config.icon;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className={`p-1.5 ${config.bg} rounded`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div>
              <div className="text-xs font-medium text-gray-900">{titleVariants[selectedTitle]}</div>
              <div className="text-xs text-gray-500">{config.label} · {content.createdAt}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdjustModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded text-xs hover:bg-purple-600 transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5" />
              AI 调整
            </button>
            <button className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors">
              <Check className="w-3.5 h-3.5" />
              发布
            </button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">#标签</span>
          <div className="flex flex-wrap gap-1">
            {content.tags.map((tag, idx) => (
              <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs flex items-center gap-1">
                {tag}
                <button className="hover:text-red-500">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <button className="px-2 py-0.5 border border-dashed border-gray-300 text-gray-500 rounded text-xs hover:border-gray-400 hover:text-gray-600">
              + 添加
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: Title Variants */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <span className="text-xs font-medium text-gray-900">标题变体 ({titleVariants.length})</span>
            <button className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              重新生成
            </button>
          </div>
          <div className="p-2 space-y-1.5 max-h-[600px] overflow-y-auto">
            {titleVariants.map((title, idx) => (
              <div
                key={idx}
                className={`group relative p-2.5 rounded border transition-all ${
                  selectedTitle === idx
                    ? 'border-red-300 bg-red-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                {editingTitleIndex === idx ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={tempTitleEdit}
                      onChange={(e) => setTempTitleEdit(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-red-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSaveTitle(idx)}
                        className="flex-1 px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 flex items-center justify-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        保存
                      </button>
                      <button
                        onClick={() => {
                          setEditingTitleIndex(null);
                          setTempTitleEdit('');
                        }}
                        className="flex-1 px-2 py-1 border border-gray-200 text-gray-600 rounded text-xs hover:bg-gray-50"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 pr-16">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => setSelectedTitle(idx)}
                      >
                        <div className="text-xs text-gray-900 leading-relaxed mb-1">{title}</div>
                        <div className="text-xs text-gray-400">{title.length} 字</div>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopyTitle(title, idx)}
                        className={`p-1 rounded transition-colors ${
                          copiedIndex === idx
                            ? 'bg-green-100 text-green-600'
                            : 'hover:bg-gray-100 text-gray-500'
                        }`}
                        title="复制"
                      >
                        {copiedIndex === idx ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingTitleIndex(idx);
                          setTempTitleEdit(title);
                        }}
                        className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {titleVariants.length > 1 && (
                        <button
                          onClick={() => handleDeleteTitle(idx)}
                          className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            
            <button className="w-full p-2 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1">
              <Plus className="w-3 h-3" />
              添加新标题
            </button>
          </div>
        </div>

        {/* Right: Content Preview */}
        <div className="space-y-3">
          {/* Images/Cover */}
          <div className="bg-white border border-gray-200 rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <span className="text-xs font-medium text-gray-900">
                {content.type === 'video' ? '封面' : '配图'} ({imageVariants.length})
              </span>
              <div className="flex items-center gap-2">
                <button className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  上传
                </button>
                <button className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI 生成
                </button>
              </div>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
              {imageVariants.map((img) => (
                <div
                  key={img.id}
                  className={`relative aspect-square rounded border-2 overflow-hidden cursor-pointer transition-all ${
                    selectedImages.includes(img.id)
                      ? 'border-red-500 ring-2 ring-red-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleImageSelection(img.id)}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  {selectedImages.includes(img.id) && (
                    <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                      <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteImage(img.id);
                    }}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              <button className="aspect-square rounded border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors">
                <Plus className="w-6 h-6 mb-1" />
                <span className="text-xs">添加图片</span>
              </button>
            </div>
          </div>

          {/* Body Content */}
          {content.type === 'article' && (
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-xs font-medium text-gray-900">正文内容</span>
                <button
                  onClick={() => setEditingBody(!editingBody)}
                  className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  {editingBody ? '完成' : '编辑'}
                </button>
              </div>
              <div className="p-3">
                {editingBody ? (
                  <textarea
                    value={bodyContent}
                    onChange={(e) => setBodyContent(e.target.value)}
                    rows={15}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 font-mono leading-relaxed"
                    placeholder="在这里输入正文内容..."
                  />
                ) : (
                  <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {bodyContent}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Video Script */}
          {content.type === 'video' && (
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-xs font-medium text-gray-900">视频脚本</span>
                <button className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                  <Edit2 className="w-3 h-3" />
                  编辑
                </button>
              </div>
              <div className="p-3 space-y-2">
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-blue-900">开场 (0-3s)</div>
                    <button className="text-blue-600 hover:text-blue-700">
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-xs text-blue-800">姐妹们！今天要跟大家分享...</div>
                </div>
                <div className="p-2.5 bg-purple-50 border border-purple-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-purple-900">主体 (3-15s)</div>
                    <button className="text-purple-600 hover:text-purple-700">
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-xs text-purple-800">这几款防晒真的不要买...</div>
                </div>
                <div className="p-2.5 bg-green-50 border border-green-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-green-900">结尾 (15-18s)</div>
                    <button className="text-green-600 hover:text-green-700">
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-xs text-green-800">记得点赞收藏哦～</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Adjust Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 max-w-md w-full">
            <div className="flex items-center gap-2 mb-4">
              <Wand2 className="w-4 h-4 text-purple-500" />
              <div className="text-sm font-medium text-gray-900">AI 调整生成结果</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1.5">调整方向</label>
                <select className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500">
                  <option>更口语化</option>
                  <option>更专业</option>
                  <option>更简洁</option>
                  <option>增加互动性</option>
                  <option>增加表情符号</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1.5">标题风格</label>
                <select className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500">
                  <option>惊喜型</option>
                  <option>疑问型</option>
                  <option>干货型</option>
                  <option>数字型</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-700 mb-1.5">具体要求</label>
                <textarea
                  placeholder="例如：多加一些表情，语气更亲切一些..."
                  rows={3}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="p-2 bg-purple-50 border border-purple-200 rounded">
                <div className="text-xs text-purple-800">
                  💡 提示：AI 会基于你的要求重新生成标题和内容
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 px-3 py-2 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 px-3 py-2 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  开始调整
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
