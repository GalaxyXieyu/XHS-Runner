import { useEffect, useState } from 'react';
import { Copy, Plus, Save, Trash2, X, Play, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface PromptProfile {
  id: number;
  name: string;
  system_prompt: string;
  user_template: string;
  model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
}

const emptyForm = {
  name: '',
  systemPrompt: '',
  userTemplate: '',
  model: '',
  temperature: '',
  maxTokens: ''
};

export function PromptTemplateTab() {
  const [profiles, setProfiles] = useState<PromptProfile[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Test panel state
  const [testExpanded, setTestExpanded] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  const loadProfiles = async () => {
    try {
      const res = await fetch('/api/prompt-profiles');
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load prompt profiles:', error);
      setProfiles([]);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleEdit = (profile: PromptProfile) => {
    setEditingId(profile.id);
    setSelectedId(profile.id);
    setForm({
      name: profile.name || '',
      systemPrompt: profile.system_prompt || '',
      userTemplate: profile.user_template || '',
      model: profile.model || '',
      temperature: profile.temperature?.toString() || '',
      maxTokens: profile.max_tokens?.toString() || ''
    });
    setTestResult('');
  };

  const handleDuplicate = (profile: PromptProfile) => {
    setEditingId(null);
    setSelectedId(null);
    setForm({
      name: `${profile.name} (复制)`,
      systemPrompt: profile.system_prompt || '',
      userTemplate: profile.user_template || '',
      model: profile.model || '',
      temperature: profile.temperature?.toString() || '',
      maxTokens: profile.max_tokens?.toString() || ''
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此模板？')) return;
    try {
      await fetch(`/api/prompt-profiles/${id}`, { method: 'DELETE' });
      await loadProfiles();
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim() || !form.userTemplate.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        systemPrompt: form.systemPrompt.trim(),
        userTemplate: form.userTemplate.trim(),
        model: form.model.trim() || undefined,
        temperature: form.temperature ? Number(form.temperature) : undefined,
        maxTokens: form.maxTokens ? Number(form.maxTokens) : undefined
      };
      if (editingId) {
        await fetch(`/api/prompt-profiles/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch('/api/prompt-profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadProfiles();
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.systemPrompt.trim()) return;
    setTestLoading(true);
    setTestResult('');

    const userMessage = form.userTemplate
      ? form.userTemplate.replace(/\{\{[^}]+\}\}/g, testInput || '测试内容')
      : testInput || '请生成内容';

    try {
      const res = await fetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: form.systemPrompt,
          userMessage,
          model: form.model || undefined
        })
      });
      const data = await res.json();
      setTestResult(data.content || data.error || '无结果');
    } catch (error: any) {
      setTestResult(`错误: ${error.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[400px]">
      {/* 左侧：模板列表 */}
      <div className="w-52 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-gray-900">模板列表</h3>
          <button
            onClick={() => { setEditingId(null); setSelectedId(null); setForm(emptyForm); setTestResult(''); }}
            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {profiles.length === 0 && (
            <div className="text-[11px] text-gray-400 py-3 text-center">暂无模板</div>
          )}
          {profiles.map((profile) => (
            <div
              key={profile.id}
              onClick={() => handleEdit(profile)}
              className={`p-2.5 rounded-lg cursor-pointer transition-all ${
                selectedId === profile.id
                  ? 'bg-blue-50 border border-blue-200 shadow-sm'
                  : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <div className="text-xs font-medium text-gray-900 truncate">{profile.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{profile.model || '默认模型'}</div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDuplicate(profile); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：编辑区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-gray-900">
            {editingId ? '编辑模板' : '新建模板'}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingId(null); setSelectedId(null); setForm(emptyForm); setTestResult(''); }}
              className="px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              重置
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">模板名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：小红书爆款标题生成"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">System Prompt</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="定义 AI 的角色和行为规则..."
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              User Template
              <span className="text-[11px] text-gray-400 ml-2 font-normal">支持变量: {'{{topic}}'}, {'{{keywords}}'}, {'{{context}}'}</span>
            </label>
            <textarea
              value={form.userTemplate}
              onChange={(e) => setForm({ ...form, userTemplate: e.target.value })}
              placeholder="用户消息模板，可使用变量..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors font-mono"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">模型</label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="留空使用默认"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                placeholder="0.7"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Tokens</label>
              <input
                type="number"
                value={form.maxTokens}
                onChange={(e) => setForm({ ...form, maxTokens: e.target.value })}
                placeholder="2048"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
              />
            </div>
          </div>

          {/* 测试面板 */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setTestExpanded(!testExpanded)}
              className="w-full px-4 py-2.5 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <span className="text-xs font-medium text-gray-700">测试模板</span>
              {testExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {testExpanded && (
              <div className="p-4 space-y-3 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="输入测试内容，将替换模板中的 {{变量}}..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                  />
                  <button
                    onClick={handleTest}
                    disabled={testLoading || !form.systemPrompt.trim()}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    运行
                  </button>
                </div>

                {(testResult || testLoading) && (
                  <div className="p-3 bg-gray-50 rounded-lg min-h-[80px]">
                    {testLoading ? (
                      <div className="flex items-center justify-center h-20 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    ) : (
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{testResult}</pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
