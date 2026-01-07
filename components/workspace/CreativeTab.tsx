import { useState } from 'react';
import { Sparkles, Search, Plus, FileText, Image as ImageIcon, Video, Calendar, Tag, Edit2, Trash2, Copy, Eye, X } from 'lucide-react';
import { Theme } from '../../App';
import { ContentDetail } from './ContentDetail';

interface CreativeTabProps {
  theme: Theme;
}

interface Content {
  id: string;
  title: string;
  type: 'article' | 'image' | 'video';
  createdAt: string;
  description: string;
  tags: string[];
  titleVariants: number;
  imageVariants: number;
  status: 'draft' | 'published';
}

export function CreativeTab({ theme }: CreativeTabProps) {
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'article' | 'image' | 'video'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'draft' | 'published'>('all');
  const [aiForm, setAiForm] = useState({
    type: 'article' as 'article' | 'image' | 'video',
    tone: '高互动',
    audience: '学生党',
    coreInfo: ''
  });

  const [contents, setContents] = useState<Content[]>([
    {
      id: '1',
      title: '千万别买这些防晒霜！2024最避雷指南',
      type: 'article',
      createdAt: '2024-01-05',
      description: '姐妹们！作为一个踩过无数防晒雷的老人，今天必须跟大家分享这些被网红吹爆但其实...',
      tags: ['防晒避雷', '夏季护肤', '图片'],
      titleVariants: 20,
      imageVariants: 3,
      status: 'draft'
    },
    {
      id: '2',
      title: '学生党必看！50元以下的防晒推荐',
      type: 'article',
      createdAt: '2024-01-04',
      description: '大学生预算有限的看过来！今天推荐几款50元以下的防晒...',
      tags: ['学生党', '平价好物', '防晒推荐'],
      titleVariants: 17,
      imageVariants: 3,
      status: 'draft'
    }
  ]);

  const handleGenerateContent = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: 调用 AI 生成接口
    const newContent: Content = {
      id: Date.now().toString(),
      title: `【AI生成】${aiForm.type === 'article' ? '图文' : aiForm.type === 'image' ? '图片' : '视频'}内容 - ${theme.name}`,
      type: aiForm.type,
      createdAt: new Date().toISOString().split('T')[0],
      description: `基于 "${aiForm.coreInfo}" 生成的${aiForm.tone}风格内容，目标受众：${aiForm.audience}`,
      tags: theme.keywords.slice(0, 3),
      titleVariants: 15,
      imageVariants: 3,
      status: 'draft'
    };
    setContents([newContent, ...contents]);
    setShowAIModal(false);
    setSelectedContent(newContent);
    setAiForm({
      type: 'article',
      tone: '高互动',
      audience: '学生党',
      coreInfo: ''
    });
  };

  const filteredContents = contents.filter(content => {
    const matchesSearch = content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         content.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || content.type === activeFilter;
    const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => content.tags.includes(tag));
    const matchesStatus = selectedStatus === 'all' || content.status === selectedStatus;
    return matchesSearch && matchesFilter && matchesTags && matchesStatus;
  });

  const typeConfig = {
    article: { label: '图文', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
    image: { label: '图片', icon: ImageIcon, color: 'text-green-600', bg: 'bg-green-50' },
    video: { label: '视频', icon: Video, color: 'text-purple-600', bg: 'bg-purple-50' }
  };

  if (selectedContent) {
    return (
      <ContentDetail
        content={selectedContent}
        theme={theme}
        onBack={() => setSelectedContent(null)}
        onUpdate={(updated) => {
          setContents(contents.map(c => c.id === updated.id ? updated : c));
          setSelectedContent(updated);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          <button
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI 生成
          </button>
        </div>

        {/* Structured Filters */}
        <div className="grid grid-cols-3 gap-2">
          {/* Type Filter */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">类型</label>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as any)}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="all">全部类型</option>
              <option value="article">图文</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
            </select>
          </div>

          {/* Tag Filter */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">标签</label>
            <select
              value={selectedTags[0] || ''}
              onChange={(e) => setSelectedTags(e.target.value ? [e.target.value] : [])}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">全部标签</option>
              {theme.keywords.map((keyword, idx) => (
                <option key={idx} value={keyword}>{keyword}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">状态</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
          </div>
        </div>

        {/* Active Filters Display */}
        {(activeFilter !== 'all' || selectedTags.length > 0 || selectedStatus !== 'all') && (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">当前筛选：</span>
            {activeFilter !== 'all' && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1">
                {typeConfig[activeFilter].label}
                <button onClick={() => setActiveFilter('all')} className="hover:text-blue-900">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {selectedTags.map((tag, idx) => (
              <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs flex items-center gap-1">
                #{tag}
                <button onClick={() => setSelectedTags([])} className="hover:text-purple-900">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {selectedStatus !== 'all' && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                {selectedStatus === 'draft' ? '草稿' : '已发布'}
                <button onClick={() => setSelectedStatus('all')} className="hover:text-green-900">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setActiveFilter('all');
                setSelectedTags([]);
                setSelectedStatus('all');
              }}
              className="ml-auto text-xs text-red-500 hover:text-red-600"
            >
              清除全部
            </button>
          </div>
        )}
      </div>

      {/* Content List */}
      <div className="space-y-2">
        {filteredContents.map((content) => {
          const config = typeConfig[content.type];
          const Icon = config.icon;
          return (
            <div
              key={content.id}
              className="bg-white border border-gray-200 rounded p-3 hover:border-gray-300 transition-colors group"
            >
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className={`w-20 h-20 ${config.bg} rounded flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-8 h-8 ${config.color}`} />
                </div>

                {/* Content Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <h3 className="text-xs font-medium text-gray-900 flex-1">{content.title}</h3>
                    <span className={`px-1.5 py-0.5 ${config.bg} ${config.color} rounded text-xs flex-shrink-0`}>
                      {config.label}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">{content.description}</p>

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {content.createdAt}
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      标题 {content.titleVariants}/{content.titleVariants}
                    </div>
                    <div className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      标签 {content.imageVariants}/{content.imageVariants}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {content.tags.map((tag, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setSelectedContent(content)}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="查看详情"
                  >
                    <Eye className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                  <button
                    onClick={() => setSelectedContent(content)}
                    className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                    title="编辑"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  </button>
                  <button
                    className="p-1.5 hover:bg-green-50 rounded transition-colors"
                    title="复制"
                  >
                    <Copy className="w-3.5 h-3.5 text-green-600" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('确定要删除这个内容吗？')) {
                        setContents(contents.filter(c => c.id !== content.id));
                      }
                    }}
                    className="p-1.5 hover:bg-red-50 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredContents.length === 0 && (
          <div className="bg-white border border-gray-200 rounded p-12 text-center">
            <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <div className="text-sm text-gray-600 mb-2">暂无内容</div>
            <button
              onClick={() => setShowAIModal(true)}
              className="text-xs text-red-500 hover:text-red-600"
            >
              使用 AI 生成内容
            </button>
          </div>
        )}
      </div>

      {/* AI Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 max-w-md w-full">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-red-500" />
              <div className="text-sm font-medium text-gray-900">AI 内容生成</div>
            </div>

            <form onSubmit={handleGenerateContent} className="space-y-3">
              {/* Content Type */}
              <div>
                <label className="block text-xs text-gray-700 mb-1.5">内容类型</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAiForm({ ...aiForm, type: 'article' })}
                    className={`p-3 rounded border-2 transition-all ${
                      aiForm.type === 'article'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <FileText className={`w-5 h-5 mx-auto mb-1 ${aiForm.type === 'article' ? 'text-red-500' : 'text-gray-400'}`} />
                    <div className={`text-xs ${aiForm.type === 'article' ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                      图文
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiForm({ ...aiForm, type: 'image' })}
                    className={`p-3 rounded border-2 transition-all ${
                      aiForm.type === 'image'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <ImageIcon className={`w-5 h-5 mx-auto mb-1 ${aiForm.type === 'image' ? 'text-red-500' : 'text-gray-400'}`} />
                    <div className={`text-xs ${aiForm.type === 'image' ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                      图片
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiForm({ ...aiForm, type: 'video' })}
                    className={`p-3 rounded border-2 transition-all ${
                      aiForm.type === 'video'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Video className={`w-5 h-5 mx-auto mb-1 ${aiForm.type === 'video' ? 'text-red-500' : 'text-gray-400'}`} />
                    <div className={`text-xs ${aiForm.type === 'video' ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                      视频
                    </div>
                  </button>
                </div>
              </div>

              {/* Tone */}
              <div>
                <label className="block text-xs text-gray-700 mb-1.5">吸睛度（高互动）</label>
                <select
                  value={aiForm.tone}
                  onChange={(e) => setAiForm({ ...aiForm, tone: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="高互动">高互动</option>
                  <option value="专业权威">专业权威</option>
                  <option value="亲和友好">亲和友好</option>
                  <option value="幽默风趣">幽默风趣</option>
                </select>
              </div>

              {/* Audience */}
              <div>
                <label className="block text-xs text-gray-700 mb-1.5">目标受众</label>
                <select
                  value={aiForm.audience}
                  onChange={(e) => setAiForm({ ...aiForm, audience: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="学生党">学生党</option>
                  <option value="职场白领">职场白领</option>
                  <option value="宝妈群体">宝妈群体</option>
                  <option value="美妆爱者">美妆爱好者</option>
                  <option value="全年龄段">全年龄段</option>
                </select>
              </div>

              {/* Core Info */}
              <div>
                <label className="block text-xs text-gray-700 mb-1.5">核心信息</label>
                <textarea
                  required
                  value={aiForm.coreInfo}
                  onChange={(e) => setAiForm({ ...aiForm, coreInfo: e.target.value })}
                  placeholder="描述你想要表达的核心内容..."
                  rows={3}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {/* Tip */}
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                <div className="text-xs text-yellow-800">
                  💡 建议：使用"干货型...标题..."，结合3款产品对比
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAIModal(false)}
                  className="flex-1 px-3 py-2 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  开始生成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}