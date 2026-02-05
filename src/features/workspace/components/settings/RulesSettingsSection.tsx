import { Edit2, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { PromptPlayground } from '@/components/workspace/PromptPlayground';

interface PromptTemplate {
  id: number;
  name: string;
  category: string;
  system_prompt: string;
  user_template: string;
  description: string;
}

interface RulesSettingsSectionProps {
  rulesSubTab: 'manage' | 'test';
  setRulesSubTab: (tab: 'manage' | 'test') => void;
  promptTemplates: PromptTemplate[];
  selectedPrompt: PromptTemplate | null;
  setSelectedPrompt: (prompt: PromptTemplate | null) => void;
  showPromptModal: boolean;
  setShowPromptModal: (open: boolean) => void;
  handleDeletePrompt: (id: number) => void;
  handleSavePrompt: () => void;
  promptFormRef: {
    name: HTMLInputElement | null;
    category: HTMLSelectElement | null;
    description: HTMLInputElement | null;
    content: HTMLTextAreaElement | null;
  };
}

export function RulesSettingsSection({
  rulesSubTab,
  setRulesSubTab,
  promptTemplates,
  selectedPrompt,
  setSelectedPrompt,
  showPromptModal,
  setShowPromptModal,
  handleDeletePrompt,
  handleSavePrompt,
  promptFormRef,
}: RulesSettingsSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-gray-900">规则训练库</h2>
          <p className="text-xs text-gray-500 mt-0.5">自定义生成规则与测试</p>
        </div>
        {rulesSubTab === 'manage' && (
          <button
            onClick={() => {
              setSelectedPrompt(null);
              setShowPromptModal(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            <Plus className="w-3 h-3" />
            添加提示词
          </button>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setRulesSubTab('manage')}
          className={`px-3 py-2 text-xs font-medium transition-colors relative ${
            rulesSubTab === 'manage'
              ? 'text-red-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          提示词管理
          {rulesSubTab === 'manage' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
          )}
        </button>
        <button
          onClick={() => setRulesSubTab('test')}
          className={`px-3 py-2 text-xs font-medium transition-colors relative ${
            rulesSubTab === 'test'
              ? 'text-red-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-1">
            <FlaskConical className="w-3 h-3" />
            提示词测试
          </div>
          {rulesSubTab === 'test' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
          )}
        </button>
      </div>

      {/* Manage Sub Tab */}
      {rulesSubTab === 'manage' && (
        <div className="grid grid-cols-2 gap-3">
          {promptTemplates.map((prompt) => (
            <div
              key={prompt.id}
              className="bg-white border border-gray-200 rounded p-3 group hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-xs font-medium text-gray-900">{prompt.name}</div>
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                      {prompt.category}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">{prompt.description}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setSelectedPrompt(prompt);
                      setShowPromptModal(true);
                    }}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <Edit2 className="w-3 h-3 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDeletePrompt(prompt.id)}
                    className="p-1 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-400 line-clamp-2 mb-2">
                {prompt.system_prompt}
              </div>
              <button
                onClick={() => {
                  setSelectedPrompt(prompt);
                  setShowPromptModal(true);
                }}
                className="text-xs text-blue-500 hover:text-blue-600"
              >
                查看/编辑
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Test Sub Tab */}
      {rulesSubTab === 'test' && (
        <div className="h-[calc(100vh-280px)] overflow-visible">
          <PromptPlayground prompts={promptTemplates} />
        </div>
      )}

      {/* Prompt Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="text-sm font-medium text-gray-900 mb-3">
              {selectedPrompt ? '编辑提示词' : '添加提示词'}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1">名称</label>
                <input
                  ref={el => { promptFormRef.name = el; }}
                  type="text"
                  defaultValue={selectedPrompt?.name}
                  placeholder="例如：小红书爆款标题"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">分类</label>
                <select
                  ref={el => { promptFormRef.category = el; }}
                  defaultValue={selectedPrompt?.category || '标题生成'}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="标题生成">标题生成</option>
                  <option value="正文生成">正文生成</option>
                  <option value="互动回复">互动回复</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">描述</label>
                <input
                  ref={el => { promptFormRef.description = el; }}
                  type="text"
                  defaultValue={selectedPrompt?.description}
                  placeholder="简短描述这个提示词的用途"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">提示词内容</label>
                <textarea
                  ref={el => { promptFormRef.content = el; }}
                  rows={8}
                  defaultValue={selectedPrompt?.system_prompt}
                  placeholder="输入提示词内容，使用 {input} 作为占位符..."
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                />
                <div className="text-xs text-gray-500 mt-1">
                  提示：使用 {'{input}'} 作为用户输入的占位符
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setSelectedPrompt(null);
                }}
                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSavePrompt}
                className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
