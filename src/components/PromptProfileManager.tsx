import { useEffect, useState } from 'react';
import { Copy, Edit2, Plus, Save, X } from 'lucide-react';

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

export function PromptProfileManager() {
  const [profiles, setProfiles] = useState<PromptProfile[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
    setForm({
      name: profile.name || '',
      systemPrompt: profile.system_prompt || '',
      userTemplate: profile.user_template || '',
      model: profile.model || '',
      temperature: profile.temperature?.toString() || '',
      maxTokens: profile.max_tokens?.toString() || ''
    });
  };

  const handleDuplicate = (profile: PromptProfile) => {
    setEditingId(null);
    setForm({
      name: `${profile.name} (复制)`,
      systemPrompt: profile.system_prompt || '',
      userTemplate: profile.user_template || '',
      model: profile.model || '',
      temperature: profile.temperature?.toString() || '',
      maxTokens: profile.max_tokens?.toString() || ''
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (!form.systemPrompt.trim() || !form.userTemplate.trim()) return;
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
      console.error('Failed to save prompt profile:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-gray-700" />
          <span className="text-xs font-medium text-gray-900">提示词模板</span>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
          }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          新建
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div className="space-y-2">
          {profiles.length === 0 && (
            <div className="text-xs text-gray-400">暂无模板，请新建一个。</div>
          )}
          {profiles.map((profile) => (
            <div key={profile.id} className="border border-gray-200 rounded px-2 py-1.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-900">{profile.name}</div>
                <div className="text-[11px] text-gray-500">{profile.model || '默认模型'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(profile)}
                  className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  编辑
                </button>
                <button
                  onClick={() => handleDuplicate(profile)}
                  className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="text-xs font-medium text-gray-800">
            {editingId ? '编辑模板' : '新建模板'}
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="模板名称"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="System Prompt"
              rows={2}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <textarea
              value={form.userTemplate}
              onChange={(e) => setForm({ ...form, userTemplate: e.target.value })}
              placeholder="User Template"
              rows={3}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="模型"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <input
                type="number"
                step="0.1"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                placeholder="temperature"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <input
                type="number"
                value={form.maxTokens}
                onChange={(e) => setForm({ ...form, maxTokens: e.target.value })}
                placeholder="max tokens"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors inline-flex items-center gap-1 disabled:opacity-60"
            >
              <Save className="w-3 h-3" />
              {saving ? '保存中...' : '保存模板'}
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              重置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
