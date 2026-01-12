import { useState, useEffect } from 'react';
import { Save, Loader2, Eye, EyeOff, Plus, Trash2, Star, Check, X, Bot, Sparkles, Zap, Brain, MessageSquare, Image, Settings2, ChevronRight } from 'lucide-react';

interface LLMProvider {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  api_key: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  is_default: number;
  is_enabled: number;
}

const PROVIDERS: Record<string, { icon: React.ReactNode; gradient: string; label: string; desc: string }> = {
  openai: { icon: <Sparkles className="w-5 h-5" />, gradient: 'from-emerald-500 to-teal-600', label: 'OpenAI', desc: 'GPT-4, GPT-3.5 Turbo' },
  anthropic: { icon: <Brain className="w-5 h-5" />, gradient: 'from-orange-500 to-amber-600', label: 'Anthropic', desc: 'Claude 3 Opus, Sonnet' },
  deepseek: { icon: <Zap className="w-5 h-5" />, gradient: 'from-blue-500 to-indigo-600', label: 'DeepSeek', desc: 'DeepSeek V2, Coder' },
  minimax: { icon: <MessageSquare className="w-5 h-5" />, gradient: 'from-purple-500 to-violet-600', label: 'MiniMax', desc: 'abab6.5' },
  zhipu: { icon: <Bot className="w-5 h-5" />, gradient: 'from-indigo-500 to-blue-600', label: '智谱 AI', desc: 'GLM-4' },
  other: { icon: <Bot className="w-5 h-5" />, gradient: 'from-gray-500 to-slate-600', label: '其他', desc: 'Custom OpenAI Compatible' },
};

export function ApiConfigTab() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', provider_type: 'openai', base_url: '', api_key: '', model_name: '', temperature: '0.7', max_tokens: '2048', is_default: false });
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [otherConfig, setOtherConfig] = useState({ imageKey: '', volcengineAccessKey: '', volcengineSecretKey: '', superbedToken: '', nanobananaEndpoint: '', nanobananaMode: 'mock', nanobananaApiKey: '' });
  const [showOtherModal, setShowOtherModal] = useState<'image' | 'nanobanana' | null>(null);
  const [showOtherKeys, setShowOtherKeys] = useState<Record<string, boolean>>({});
  const [savingOther, setSavingOther] = useState(false);

  useEffect(() => { loadProviders(); loadOtherSettings(); }, []);

  const loadProviders = async () => {
    const res = await fetch('/api/llm-providers');
    const data = await res.json();
    setProviders(Array.isArray(data) ? data : []);
  };

  const loadOtherSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setOtherConfig({
      imageKey: data.imageKey || '', volcengineAccessKey: data.volcengineAccessKey || '', volcengineSecretKey: data.volcengineSecretKey || '',
      superbedToken: data.superbedToken || '', nanobananaEndpoint: data.nanobananaEndpoint || '', nanobananaMode: data.nanobananaMode || 'mock', nanobananaApiKey: data.nanobananaApiKey || ''
    });
  };

  const openNew = () => {
    setEditingProvider(null);
    setForm({ name: '', provider_type: 'openai', base_url: '', api_key: '', model_name: '', temperature: '0.7', max_tokens: '2048', is_default: false });
    setShowKey(false);
    setShowForm(true);
  };

  const openEdit = (p: LLMProvider) => {
    setEditingProvider(p);
    setForm({ name: p.name, provider_type: p.provider_type, base_url: p.base_url || '', api_key: '', model_name: p.model_name || '', temperature: String(p.temperature), max_tokens: String(p.max_tokens), is_default: !!p.is_default });
    setShowKey(false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, temperature: parseFloat(form.temperature), max_tokens: parseInt(form.max_tokens), is_enabled: true };
      if (editingProvider) {
        await fetch(`/api/llm-providers/${editingProvider.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch('/api/llm-providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      setShowForm(false);
      await loadProviders();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此配置？')) return;
    await fetch(`/api/llm-providers/${id}`, { method: 'DELETE' });
    await loadProviders();
  };

  const saveOtherConfig = async () => {
    setSavingOther(true);
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(otherConfig) });
      setShowOtherModal(null);
    } finally { setSavingOther(false); }
  };

  const getStyle = (type: string) => PROVIDERS[type] || PROVIDERS.other;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* LLM 模型 */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              LLM 模型
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded border border-blue-100">Core</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">配置用于内容生成的大语言模型 API</p>
          </div>
          <button onClick={openNew} className="h-8 px-3 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all hover:shadow hover:-translate-y-0.5 inline-flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> 添加模型
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {providers.map((p) => {
            const style = getStyle(p.provider_type);
            return (
              <div
                key={p.id}
                onClick={() => openEdit(p)}
                className={`group relative p-4 bg-white border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${p.is_default ? 'border-blue-500/30 ring-1 ring-blue-500/10' : 'border-gray-200 hover:border-blue-200'}`}
              >
                {p.is_default && (
                  <div className="absolute top-3 right-3 z-10">
                    <Star className="w-3.5 h-3.5 fill-blue-500 text-blue-500" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${style.gradient} flex items-center justify-center text-white shadow-sm shrink-0`}>
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate pr-4">{p.name}</h4>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 shrink-0">
                        {style.label}
                      </span>
                      <p className="text-[11px] text-gray-400 truncate">{p.model_name || '未配置'}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* 添加卡片 */}
          <div
            onClick={openNew}
            className="group relative p-4 border border-dashed border-gray-300 rounded-lg cursor-pointer transition-all duration-200 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-sm flex flex-col items-center justify-center min-h-[88px]"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 mb-1.5 group-hover:bg-blue-100 group-hover:text-blue-500 transition-colors">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-gray-500 group-hover:text-blue-600 transition-colors">配置新模型</span>
          </div>
        </div>
      </section>

      {/* 其他服务 */}
      <section className="pt-6 border-t border-gray-100">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          其他服务
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-600 rounded border border-purple-100">Extensions</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {/* 图像生成 */}
          <div
            onClick={() => setShowOtherModal('image')}
            className="group p-4 bg-white border border-gray-200 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-purple-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Image className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900">图像生成</h4>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{otherConfig.imageKey ? '已连接服务' : '点击配置'}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-purple-500 transition-colors shrink-0" />
            </div>
          </div>

          {/* Nanobanana */}
          <div
            onClick={() => setShowOtherModal('nanobanana')}
            className="group p-4 bg-white border border-gray-200 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-amber-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900">Nanobanana</h4>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{otherConfig.nanobananaEndpoint ? '已连接服务' : '点击配置'}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors shrink-0" />
            </div>
          </div>
        </div>
      </section>

      {/* LLM 配置弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-lg w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100" onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div className="relative px-6 pt-6 pb-5 bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
              <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getStyle(form.provider_type).gradient} flex items-center justify-center text-white shadow-lg ring-2 ring-white`}>
                  {getStyle(form.provider_type).icon}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900">{editingProvider ? '编辑模型配置' : '添加模型配置'}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">配置 AI 大模型的 API 连接信息</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* 基础信息 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  基础信息
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="配置名称" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="例如: GPT-4o" autoFocus />
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">服务商</label>
                    <select 
                      value={form.provider_type} 
                      onChange={e => setForm({ ...form, provider_type: e.target.value })} 
                      className="w-full h-9 px-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer hover:border-blue-300"
                    >
                      {Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label} - {v.desc}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* API 配置 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  API 连接
                </div>
                <Field label="API 地址 (Base URL)" value={form.base_url} onChange={v => setForm({ ...form, base_url: v })} placeholder="https://api.openai.com/v1" />
                <Field label="模型 ID (Model Name)" value={form.model_name} onChange={v => setForm({ ...form, model_name: v })} placeholder="gpt-4-turbo-preview" />
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">
                    API Key
                    {editingProvider && <span className="ml-2 text-[10px] text-gray-400 font-normal bg-gray-100 px-1.5 py-0.5 rounded">留空保持不变</span>}
                  </label>
                  <div className="relative group">
                    <input 
                      type={showKey ? 'text' : 'password'} 
                      value={form.api_key} 
                      onChange={e => setForm({ ...form, api_key: e.target.value })} 
                      placeholder="sk-..." 
                      className="w-full h-9 px-3 pr-9 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono group-hover:border-blue-300" 
                    />
                    <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 transition-colors">
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* 高级参数 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  模型参数
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Temperature" value={form.temperature} onChange={v => setForm({ ...form, temperature: v })} placeholder="0.7" type="number" />
                  <Field label="Max Tokens" value={form.max_tokens} onChange={v => setForm({ ...form, max_tokens: v })} placeholder="2048" type="number" />
                </div>
                
                <div className="pt-1">
                  <label className="flex items-center gap-3 p-3 bg-gray-50/50 border border-gray-100 rounded-lg cursor-pointer hover:bg-blue-50/50 hover:border-blue-200 transition-all group">
                    <div className="relative flex items-center">
                      <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} className="peer w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-900 group-hover:text-blue-700">设为默认模型</div>
                      <div className="text-[10px] text-gray-500 group-hover:text-blue-600/70">新建任务时将自动使用此配置</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* 底部操作 */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              {editingProvider ? (
                <button onClick={() => { handleDelete(editingProvider.id); setShowForm(false); }} className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 font-medium">
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              ) : <div />}
              <div className="flex gap-2.5">
                <button onClick={() => setShowForm(false)} className="h-8 px-4 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-all hover:shadow-sm">取消</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()} className="h-8 px-4 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all hover:shadow hover:shadow-blue-500/20 hover:-translate-y-0.5 inline-flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 保存配置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 图像生成配置弹窗 */}
      {showOtherModal === 'image' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setShowOtherModal(null)}>
          <div className="bg-white rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="relative px-6 pt-6 pb-5 bg-gradient-to-b from-purple-50/50 to-white border-b border-gray-100">
              <button onClick={() => setShowOtherModal(null)} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg ring-2 ring-white">
                  <Image className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900">图像生成配置</h4>
                  <p className="text-xs text-gray-500 mt-0.5">配置 AI 图像生成服务的 API</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <SecretField label="图像 API Key" value={otherConfig.imageKey} onChange={v => setOtherConfig({ ...otherConfig, imageKey: v })} placeholder="your-api-key" keyName="imageKey" showKeys={showOtherKeys} toggleKey={k => setShowOtherKeys(p => ({ ...p, [k]: !p[k] }))} />
              <div className="grid grid-cols-2 gap-4">
                <SecretField label="火山引擎 AK" value={otherConfig.volcengineAccessKey} onChange={v => setOtherConfig({ ...otherConfig, volcengineAccessKey: v })} placeholder="access key" keyName="volcengineAccessKey" showKeys={showOtherKeys} toggleKey={k => setShowOtherKeys(p => ({ ...p, [k]: !p[k] }))} />
                <SecretField label="火山引擎 SK" value={otherConfig.volcengineSecretKey} onChange={v => setOtherConfig({ ...otherConfig, volcengineSecretKey: v })} placeholder="secret key" keyName="volcengineSecretKey" showKeys={showOtherKeys} toggleKey={k => setShowOtherKeys(p => ({ ...p, [k]: !p[k] }))} />
              </div>
              <SecretField label="Superbed Token" value={otherConfig.superbedToken} onChange={v => setOtherConfig({ ...otherConfig, superbedToken: v })} placeholder="superbed token" keyName="superbedToken" showKeys={showOtherKeys} toggleKey={k => setShowOtherKeys(p => ({ ...p, [k]: !p[k] }))} />
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2.5">
              <button onClick={() => setShowOtherModal(null)} className="h-8 px-4 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all">取消</button>
              <button onClick={saveOtherConfig} disabled={savingOther} className="h-8 px-4 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all hover:shadow hover:-translate-y-0.5 inline-flex items-center gap-1.5">
                {savingOther ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nanobanana 配置弹窗 */}
      {showOtherModal === 'nanobanana' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setShowOtherModal(null)}>
          <div className="bg-white rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="relative px-6 pt-6 pb-5 bg-gradient-to-b from-amber-50/50 to-white border-b border-gray-100">
              <button onClick={() => setShowOtherModal(null)} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg ring-2 ring-white">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900">Nanobanana 配置</h4>
                  <p className="text-xs text-gray-500 mt-0.5">配置图文生成服务</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Endpoint" value={otherConfig.nanobananaEndpoint} onChange={v => setOtherConfig({ ...otherConfig, nanobananaEndpoint: v })} placeholder="https://..." />
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">模式</label>
                <select value={otherConfig.nanobananaMode} onChange={e => setOtherConfig({ ...otherConfig, nanobananaMode: e.target.value })} className="w-full h-9 px-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer">
                  <option value="mock">Mock</option>
                  <option value="remote">Remote</option>
                </select>
              </div>
              <SecretField label="API Key" value={otherConfig.nanobananaApiKey} onChange={v => setOtherConfig({ ...otherConfig, nanobananaApiKey: v })} placeholder="api key" keyName="nanobananaApiKey" showKeys={showOtherKeys} toggleKey={k => setShowOtherKeys(p => ({ ...p, [k]: !p[k] }))} />
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2.5">
              <button onClick={() => setShowOtherModal(null)} className="h-8 px-4 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all">取消</button>
              <button onClick={saveOtherConfig} disabled={savingOther} className="h-8 px-4 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all hover:shadow hover:-translate-y-0.5 inline-flex items-center gap-1.5">
                {savingOther ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', autoFocus = false }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; autoFocus?: boolean }) {
  return (
    <div className="group">
      <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">{label}</label>
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder} 
        autoFocus={autoFocus}
        className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all group-hover:border-blue-300" 
      />
    </div>
  );
}

function SecretField({ label, value, onChange, placeholder, keyName, showKeys, toggleKey }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; keyName: string; showKeys: Record<string, boolean>; toggleKey: (k: string) => void }) {
  return (
    <div className="group">
      <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input 
          type={showKeys[keyName] ? 'text' : 'password'} 
          value={value} 
          onChange={e => onChange(e.target.value)} 
          placeholder={placeholder} 
          className="w-full h-9 px-3 pr-9 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono group-hover:border-blue-300" 
        />
        <button type="button" onClick={() => toggleKey(keyName)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 transition-colors">
          {showKeys[keyName] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
