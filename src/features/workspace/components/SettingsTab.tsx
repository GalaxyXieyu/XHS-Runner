import { useState, useEffect } from 'react';
import { Key, Database, Settings as SettingsIcon, QrCode, Smartphone, CheckCircle, Loader, Plus, Edit2, Trash2, FlaskConical, Activity, Globe } from 'lucide-react';
import type { Theme } from '@/App';
import { PromptPlayground } from '@/components/workspace/PromptPlayground';
import type { AuthStatus } from '@/hooks/useAuthStatus';

interface AuthProps {
  status: AuthStatus;
  isLoggedIn: boolean;
  isChecking: boolean;
  isLoggingIn: boolean;
  error: string | null;
  qrCodeUrl: string | null;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  refreshQRCode: () => Promise<boolean>;
}

interface SettingsTabProps {
  theme: Theme;
  auth: AuthProps;
}

type SettingSection = 'hotNumber' | 'api' | 'rules' | 'system';

interface LLMConfig {
  id: number;
  name: string;
  provider_type: string;
  model_name: string;
  base_url?: string;
  api_key?: string;
  configured: boolean;
  supports_vision?: boolean;
  supports_image_gen?: boolean;
}

// 注意：base_url 已在接口中定义

interface PromptTemplate {
  id: number;
  name: string;
  category: string;
  system_prompt: string;
  user_template: string;
  description: string;
}

interface ExtensionService {
  id: number;
  service_type: string;
  name: string;
  api_key?: string;
  endpoint?: string;
  is_enabled: number;
}

interface LangfuseConfig {
  configured: boolean;
  enabled: boolean;
  endpoint: string;
  publicKey: string;
  hasSecretKey: boolean;
}

interface TavilyConfig {
  configured: boolean;
  enabled: boolean;
  endpoint: string;
  hasApiKey: boolean;
}

const defaultExtensionTypes = [
  { service_type: 'image', name: '图像生成', description: 'AI 图像生成服务（如 DALL-E、Midjourney）' },
  { service_type: 'imagehost', name: '图床', description: '图片存储与 CDN 服务' },
  { service_type: 'video', name: '视频处理', description: '视频编辑、转码和存储服务' },
  { service_type: 'tts', name: '文本转语音', description: 'TTS 文本转语音服务' },
  { service_type: 'nanobanana', name: 'Nanobanana', description: '第三方数据分析服务' }
];

export function SettingsTab({ theme: _theme, auth }: SettingsTabProps) {
  const [activeSection, setActiveSection] = useState<SettingSection>('hotNumber');
  const [selectedAPI, setSelectedAPI] = useState<string | null>(null);
  const [selectedLLM, setSelectedLLM] = useState<LLMConfig | null>(null);
  const [showLLMModal, setShowLLMModal] = useState(false);
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [extensionServices, setExtensionServices] = useState<ExtensionService[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [rulesSubTab, setRulesSubTab] = useState<'manage' | 'test'>('manage');
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [langfuseConfig, setLangfuseConfig] = useState<LangfuseConfig | null>(null);
  const [showLangfuseModal, setShowLangfuseModal] = useState(false);
  const [langfuseSaving, setLangfuseSaving] = useState(false);
  const [tavilyConfig, setTavilyConfig] = useState<TavilyConfig | null>(null);
  const [showTavilyModal, setShowTavilyModal] = useState(false);
  const [tavilySaving, setTavilySaving] = useState(false);
  const [jimengConfig, setJimengConfig] = useState({ apiKey: '', endpointId: '' });
  const [showJimengModal, setShowJimengModal] = useState(false);
  const [jimengSaving, setJimengSaving] = useState(false);

  const jimengConfigured = Boolean(jimengConfig.apiKey || jimengConfig.endpointId);

  // Form refs for modals
  const llmFormRef = {
    name: null as HTMLInputElement | null,
    provider: null as HTMLSelectElement | null,
    baseUrl: null as HTMLInputElement | null,
    apiKey: null as HTMLInputElement | null,
    model: null as HTMLInputElement | null,
    supportsVision: null as HTMLInputElement | null,
    supportsImageGen: null as HTMLInputElement | null,
  };
  const promptFormRef = {
    name: null as HTMLInputElement | null,
    category: null as HTMLSelectElement | null,
    description: null as HTMLInputElement | null,
    content: null as HTMLTextAreaElement | null,
  };
  const extensionFormRef = {
    apiKey: null as HTMLInputElement | null,
    endpoint: null as HTMLInputElement | null,
  };
  const langfuseFormRef = {
    secretKey: null as HTMLInputElement | null,
    publicKey: null as HTMLInputElement | null,
    endpoint: null as HTMLInputElement | null,
  };
  const tavilyFormRef = {
    apiKey: null as HTMLInputElement | null,
    endpoint: null as HTMLInputElement | null,
  };

  // Load data on mount
  useEffect(() => {
    loadLlmProviders();
    loadPromptProfiles();
    loadExtensionServices();
    loadCaptureEnabled();
    loadLangfuseConfig();
    loadTavilyConfig();
    loadJimengConfig();
  }, []);

  const loadCaptureEnabled = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setCaptureEnabled(data.captureEnabled ?? false);
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  };

  const handleCaptureToggle = async (enabled: boolean) => {
    setCaptureEnabled(enabled);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captureEnabled: enabled }),
      });
    } catch (e) {
      console.error('Failed to save capture setting:', e);
    }
  };

  const loadLlmProviders = async () => {
    try {
      let data: any[];
      if (window.llmProviders) {
        data = await window.llmProviders.list();
      } else {
        const res = await fetch('/api/llm-providers');
        data = await res.json();
      }
      setLlmConfigs(data.map((p: any) => ({
        ...p,
        configured: !!p.api_key
      })));
    } catch (e) {
      console.error('Failed to load LLM providers:', e);
    }
  };

  const loadPromptProfiles = async () => {
    try {
      let data: any;
      if (window.promptProfiles) {
        data = await window.promptProfiles.list();
      } else {
        const res = await fetch('/api/prompt-profiles');
        data = await res.json();
      }
      setPromptTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load prompt profiles:', e);
    }
  };

  const loadExtensionServices = async () => {
    try {
      let data: any;
      if (window.extensionServices) {
        data = await window.extensionServices.list();
      } else {
        const res = await fetch('/api/extension-services');
        data = await res.json();
      }
      setExtensionServices(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load extension services:', e);
    }
  };

  const loadLangfuseConfig = async () => {
    try {
      const res = await fetch('/api/settings/langfuse');
      const data = await res.json();
      setLangfuseConfig(data);
    } catch (e) {
      console.error('Failed to load Langfuse config:', e);
    }
  };

  const handleSaveLangfuse = async () => {
    const secretKey = langfuseFormRef.secretKey?.value?.trim();
    const publicKey = langfuseFormRef.publicKey?.value?.trim();
    const endpoint = langfuseFormRef.endpoint?.value?.trim();

    setLangfuseSaving(true);
    try {
      await fetch('/api/settings/langfuse', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretKey: secretKey || undefined,
          publicKey,
          endpoint,
          enabled: true,
        }),
      });
      await loadLangfuseConfig();
      setShowLangfuseModal(false);
    } catch (e) {
      console.error('Failed to save Langfuse config:', e);
    } finally {
      setLangfuseSaving(false);
    }
  };

  const handleToggleLangfuse = async (enabled: boolean) => {
    try {
      await fetch('/api/settings/langfuse', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await loadLangfuseConfig();
    } catch (e) {
      console.error('Failed to toggle Langfuse:', e);
    }
  };

  const loadTavilyConfig = async () => {
    try {
      const res = await fetch('/api/settings/tavily');
      const data = await res.json();
      setTavilyConfig(data);
    } catch (e) {
      console.error('Failed to load Tavily config:', e);
    }
  };

  const loadJimengConfig = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setJimengConfig({
        apiKey: data.jimeng_api_key || '',
        endpointId: data.seedream_45_model || ''
      });
    } catch (e) {
      console.error('Failed to load Jimeng config:', e);
    }
  };

  const handleSaveJimeng = async () => {
    setJimengSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jimeng_api_key: jimengConfig.apiKey,
          seedream_45_model: jimengConfig.endpointId
        }),
      });
      await loadJimengConfig();
      setShowJimengModal(false);
    } catch (e) {
      console.error('Failed to save Jimeng config:', e);
    } finally {
      setJimengSaving(false);
    }
  };

  const handleSaveTavily = async () => {
    const apiKey = tavilyFormRef.apiKey?.value?.trim();
    const endpoint = tavilyFormRef.endpoint?.value?.trim();

    setTavilySaving(true);
    try {
      await fetch('/api/settings/tavily', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          endpoint: endpoint || undefined,
          enabled: true,
        }),
      });
      await loadTavilyConfig();
      setShowTavilyModal(false);
    } catch (e) {
      console.error('Failed to save Tavily config:', e);
    } finally {
      setTavilySaving(false);
    }
  };

  const handleToggleTavily = async (enabled: boolean) => {
    try {
      await fetch('/api/settings/tavily', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await loadTavilyConfig();
    } catch (e) {
      console.error('Failed to toggle Tavily:', e);
    }
  };

  const sections = [
    { id: 'hotNumber' as const, label: '热号测控', sublabel: '连接小红书账号', icon: QrCode },
    { id: 'api' as const, label: 'API配置', sublabel: '管理 LLM 模型', icon: Key },
    { id: 'rules' as const, label: '规则训练库', sublabel: '自定义生成规则', icon: Database },
    { id: 'system' as const, label: '系统参数', sublabel: '自动化与数据', icon: SettingsIcon }
  ];

  // CRUD handlers for LLM providers
  const handleSaveLLM = async () => {
    const name = llmFormRef.name?.value?.trim();
    const provider_type = llmFormRef.provider?.value;
    const base_url = llmFormRef.baseUrl?.value?.trim();
    const api_key = llmFormRef.apiKey?.value?.trim();
    const model_name = llmFormRef.model?.value?.trim();
    const supports_vision = llmFormRef.supportsVision?.checked ?? false;
    const supports_image_gen = llmFormRef.supportsImageGen?.checked ?? false;
    if (!name) return;

    try {
      if (selectedLLM) {
        // Update
        if (window.llmProviders) {
          await window.llmProviders.update({ id: selectedLLM.id, name, provider_type, base_url, api_key, model_name, supports_vision, supports_image_gen });
        } else {
          await fetch(`/api/llm-providers/${selectedLLM.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, provider_type, base_url, api_key, model_name, supports_vision, supports_image_gen }),
          });
        }
      } else {
        // Create
        if (window.llmProviders) {
          await window.llmProviders.create({ name, provider_type, base_url, api_key, model_name, supports_vision, supports_image_gen });
        } else {
          await fetch('/api/llm-providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, provider_type, base_url, api_key, model_name, supports_vision, supports_image_gen }),
          });
        }
      }
      await loadLlmProviders();
    } catch (e) {
      console.error('Failed to save LLM provider:', e);
    }
    setShowLLMModal(false);
    setSelectedLLM(null);
  };

  const handleDeleteLLM = async (id: number) => {
    try {
      if (window.llmProviders) {
        await window.llmProviders.delete(id);
      } else {
        await fetch(`/api/llm-providers/${id}`, { method: 'DELETE' });
      }
      await loadLlmProviders();
    } catch (e) {
      console.error('Failed to delete LLM provider:', e);
    }
  };

  // CRUD handlers for prompt profiles
  const handleSavePrompt = async () => {
    const name = promptFormRef.name?.value?.trim();
    const category = promptFormRef.category?.value;
    const description = promptFormRef.description?.value?.trim();
    const system_prompt = promptFormRef.content?.value?.trim();
    if (!name) return;

    try {
      if (selectedPrompt) {
        if (window.promptProfiles) {
          await window.promptProfiles.update({ id: selectedPrompt.id, name, category, description, system_prompt });
        } else {
          await fetch(`/api/prompt-profiles/${selectedPrompt.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, description, system_prompt }),
          });
        }
      } else {
        if (window.promptProfiles) {
          await window.promptProfiles.create({ name, category, description, system_prompt });
        } else {
          await fetch('/api/prompt-profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, description, system_prompt }),
          });
        }
      }
      await loadPromptProfiles();
    } catch (e) {
      console.error('Failed to save prompt profile:', e);
    }
    setShowPromptModal(false);
    setSelectedPrompt(null);
  };

  const handleDeletePrompt = async (id: number) => {
    try {
      if (window.promptProfiles) {
        await window.promptProfiles.delete(id);
      } else {
        await fetch(`/api/prompt-profiles/${id}`, { method: 'DELETE' });
      }
      await loadPromptProfiles();
    } catch (e) {
      console.error('Failed to delete prompt profile:', e);
    }
  };

  // CRUD handlers for extension services
  const handleSaveExtension = async () => {
    if (!selectedAPI) return;
    const api_key = extensionFormRef.apiKey?.value?.trim();
    const endpoint = extensionFormRef.endpoint?.value?.trim();
    const service = defaultExtensionTypes.find(s => s.service_type === selectedAPI);
    if (!service) return;

    try {
      const existing = extensionServices.find(s => s.service_type === selectedAPI);
      if (existing) {
        if (window.extensionServices) {
          await window.extensionServices.update({ id: existing.id, api_key, endpoint, is_enabled: 1 });
        } else {
          await fetch(`/api/extension-services/${existing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key, endpoint, is_enabled: 1 }),
          });
        }
      } else {
        if (window.extensionServices) {
          await window.extensionServices.create({ service_type: selectedAPI, name: service.name, api_key, endpoint, is_enabled: 1 });
        } else {
          await fetch('/api/extension-services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_type: selectedAPI, name: service.name, api_key, endpoint, is_enabled: 1 }),
          });
        }
      }
      await loadExtensionServices();
    } catch (e) {
      console.error('Failed to save extension service:', e);
    }
    setSelectedAPI(null);
  };

  return (
    <div className="h-full flex bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-48 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="py-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full px-3 py-2 flex items-start gap-2 text-left transition-colors ${
                  activeSection === section.id
                    ? 'bg-red-50 border-r-2 border-red-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                  activeSection === section.id ? 'text-red-500' : 'text-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium ${
                    activeSection === section.id ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    {section.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                    {section.sublabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeSection === 'hotNumber' && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-900">热号测控</h2>
              <p className="text-xs text-gray-500 mt-0.5">连接小红书账号</p>
            </div>

            {/* Status */}
            <div className="bg-white border border-gray-200 rounded p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-xs font-medium text-gray-900">登录状态</div>
                {auth.isChecking && <Loader className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                {auth.isChecking && <div className="text-xs text-gray-500">检测中...</div>}
                {!auth.isChecking && auth.isLoggedIn && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="w-3 h-3" />
                    已连接
                  </div>
                )}
                {!auth.isChecking && !auth.isLoggedIn && !auth.isLoggingIn && (
                  <div className="text-xs text-gray-500">未登录</div>
                )}
                {auth.isLoggingIn && <Loader className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                {auth.isLoggingIn && <div className="text-xs text-gray-500">登录中...</div>}
              </div>
              {auth.error && (
                <div className="text-xs text-red-500">{auth.error}</div>
              )}
            </div>

            {/* Action Items */}
            <div className="space-y-2">
              {/* Open App */}
              <div className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    auth.isLoggedIn ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <Smartphone className={`w-3 h-3 ${
                      auth.isLoggedIn ? 'text-red-500' : 'text-gray-500'
                    }`} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-900">打开小红书 APP</div>
                    <div className="text-xs text-gray-500">确保已普通的小红书账号</div>
                  </div>
                </div>
                {auth.isLoggedIn && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>

              {/* Auto QR Code */}
              <div className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-between ${
                    auth.isLoggingIn || auth.isLoggedIn ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <QrCode className={`w-3 h-3 ${
                      auth.isLoggingIn || auth.isLoggedIn ? 'text-red-500' : 'text-gray-500'
                    }`} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-900">自动二维码</div>
                    <div className="text-xs text-gray-500">通过扫码登录门，在弹出口扫码</div>
                  </div>
                </div>
                {auth.isLoggingIn && <Loader className="w-4 h-4 text-blue-500 animate-spin" />}
                {auth.isLoggedIn && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>

              {/* Save Credentials */}
              <div className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    auth.isLoggedIn ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <Database className={`w-3 h-3 ${
                      auth.isLoggedIn ? 'text-red-500' : 'text-gray-500'
                    }`} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-900">保存凭据</div>
                    <div className="text-xs text-gray-500">登录凭据已自动保存前</div>
                  </div>
                </div>
                {auth.isLoggedIn && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
            </div>

            {!auth.isLoggedIn && !auth.isLoggingIn && !auth.isChecking && (
              <div className="mt-4">
                <button
                  onClick={() => auth.login()}
                  className="px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  开始连接
                </button>
              </div>
            )}

            {auth.isLoggedIn && (
              <div className="mt-4">
                <button
                  onClick={() => auth.logout()}
                  className="px-4 py-2 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        )}

        {activeSection === 'api' && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-900">API 配置</h2>
              <p className="text-xs text-gray-500 mt-0.5">管理账号、API和系统配置</p>
            </div>

            {/* LLM Models */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-medium text-gray-900">LLM 模型</h3>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Core</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedLLM(null);
                    setShowLLMModal(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  添加模型
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">配置用于内容生成和数据处理的 API</p>
              
              <div className="grid grid-cols-2 gap-3">
                {llmConfigs.map((config) => (
                  <div
                    key={config.id}
                    className={`bg-white border rounded p-3 group hover:border-gray-300 transition-colors ${
                      config.configured ? 'border-green-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-xs font-medium text-gray-900">{config.name}</div>
                          {config.configured && (
                            <CheckCircle className="w-3 h-3 text-green-500" />
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{config.provider_type}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{config.model_name}</div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setSelectedLLM(config);
                            setShowLLMModal(true);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Edit2 className="w-3 h-3 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDeleteLLM(config.id)}
                          className="p-1 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedLLM(config);
                        setShowLLMModal(true);
                      }}
                      className="text-xs text-blue-500 hover:text-blue-600"
                    >
                      {config.configured ? '重新配置' : '点击配置'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Extensions */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-gray-900">其他服务</h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Extensions</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {defaultExtensionTypes.map((service) => {
                  const configured = extensionServices.find(s => s.service_type === service.service_type);
                  return (
                    <div
                      key={service.service_type}
                      className={`bg-white border rounded p-3 hover:border-gray-300 transition-colors cursor-pointer ${
                        configured?.is_enabled ? 'border-green-200' : 'border-gray-200'
                      }`}
                      onClick={() => setSelectedAPI(service.service_type)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-xs font-medium text-gray-900">{service.name}</div>
                        {configured?.is_enabled ? <CheckCircle className="w-3 h-3 text-green-500" /> : null}
                      </div>
                      <div className="text-xs text-gray-500 mb-1">{service.description}</div>
                      <div className="text-xs text-blue-500 hover:text-blue-600">
                        {configured ? '重新配置' : '点击配置'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Jimeng Seedream 4.5 */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-gray-900">即梦 4.5</h3>
                <span className="px-2 py-0.5 bg-pink-100 text-pink-700 text-xs rounded">Image</span>
              </div>
              <div className={`bg-white border rounded p-3 flex items-center justify-between ${jimengConfigured ? 'border-green-200' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-gray-500" />
                  <div>
                    <div className="text-xs font-medium text-gray-900">Seedream 4.5 (Ark)</div>
                    <div className="text-xs text-gray-500">配置 API Key 与 Endpoint ID</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {jimengConfigured && <CheckCircle className="w-3 h-3 text-green-500" />}
                  <button
                    onClick={() => setShowJimengModal(true)}
                    className="px-2 py-1 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    {jimengConfigured ? '重新配置' : '配置'}
                  </button>
                </div>
              </div>
            </div>

            {/* LLM Config Modal */}
            {showLLMModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
                  <div className="text-sm font-medium text-gray-900 mb-3">
                    {selectedLLM ? '编辑 LLM 模型' : '添加 LLM 模型'}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">名称</label>
                      <input
                        ref={el => { llmFormRef.name = el; }}
                        type="text"
                        defaultValue={selectedLLM?.name}
                        placeholder="例如：GPT-4"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Provider</label>
                      <select
                        ref={el => { llmFormRef.provider = el; }}
                        defaultValue={selectedLLM?.provider_type || 'OpenAI'}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google AI</option>
                        <option value="azure">Azure OpenAI</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Base URL</label>
                      <input
                        ref={el => { llmFormRef.baseUrl = el; }}
                        type="text"
                        defaultValue={selectedLLM?.base_url}
                        placeholder="https://api.openai.com/v1"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Key</label>
                      <input
                        ref={el => { llmFormRef.apiKey = el; }}
                        type="password"
                        defaultValue={selectedLLM?.api_key}
                        placeholder="sk-..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Model</label>
                      <input
                        ref={el => { llmFormRef.model = el; }}
                        type="text"
                        defaultValue={selectedLLM?.model_name}
                        placeholder="gpt-4"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div className="flex gap-4 pt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          ref={el => { llmFormRef.supportsVision = el; }}
                          type="checkbox"
                          defaultChecked={selectedLLM?.supports_vision ?? false}
                          className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                        />
                        支持图片输入 (Vision)
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          ref={el => { llmFormRef.supportsImageGen = el; }}
                          type="checkbox"
                          defaultChecked={selectedLLM?.supports_image_gen ?? false}
                          className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                        />
                        支持图片生成
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        setShowLLMModal(false);
                        setSelectedLLM(null);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveLLM}
                      className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* API Config Modal */}
            {selectedAPI && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
                  <div className="text-sm font-medium text-gray-900 mb-3">
                    配置 {defaultExtensionTypes.find(s => s.service_type === selectedAPI)?.name}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Key</label>
                      <input
                        ref={el => { extensionFormRef.apiKey = el; }}
                        type="password"
                        defaultValue={extensionServices.find(s => s.service_type === selectedAPI)?.api_key}
                        placeholder="输入 API Key"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Endpoint (可选)</label>
                      <input
                        ref={el => { extensionFormRef.endpoint = el; }}
                        type="text"
                        defaultValue={extensionServices.find(s => s.service_type === selectedAPI)?.endpoint}
                        placeholder="https://..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setSelectedAPI(null)}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveExtension}
                      className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Jimeng Config Modal */}
            {showJimengModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
                  <div className="text-sm font-medium text-gray-900 mb-3">配置 即梦 4.5</div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Key</label>
                      <input
                        type="password"
                        value={jimengConfig.apiKey}
                        onChange={(e) => setJimengConfig({ ...jimengConfig, apiKey: e.target.value })}
                        placeholder="08bd... 或 ark-..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Endpoint ID / Model ID</label>
                      <input
                        type="text"
                        value={jimengConfig.endpointId}
                        onChange={(e) => setJimengConfig({ ...jimengConfig, endpointId: e.target.value })}
                        placeholder="ep-xxxx 或 doubao-seedream-4.5"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setShowJimengModal(false)}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveJimeng}
                      disabled={jimengSaving}
                      className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-60"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'rules' && (
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
        )}

        {activeSection === 'system' && (
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-900">系统参数</h2>
              <p className="text-xs text-gray-500 mt-0.5">自动化与数据</p>
            </div>

            <div className="space-y-3">
              {/* Automation */}
              <div className="bg-white border border-gray-200 rounded p-4">
                <div className="text-xs font-medium text-gray-900 mb-3">自动化功能</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={captureEnabled}
                      onChange={(e) => handleCaptureToggle(e.target.checked)}
                      className="w-3.5 h-3.5 text-red-500 rounded"
                    />
                    <span className="text-xs text-gray-700">启用笔记抓取</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="w-3.5 h-3.5 text-red-500 rounded" />
                    <span className="text-xs text-gray-700">启用自动回复</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="w-3.5 h-3.5 text-red-500 rounded" />
                    <span className="text-xs text-gray-700">启用竞品监控</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="w-3.5 h-3.5 text-red-500 rounded" />
                    <span className="text-xs text-gray-700">启用自动清理</span>
                  </label>
                </div>
              </div>

              {/* Thresholds */}
              <div className="bg-white border border-gray-200 rounded p-4">
                <div className="text-xs font-medium text-gray-900 mb-3">阈值设置</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">自动清理阈值</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        defaultValue={100}
                        className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <span className="text-xs text-gray-500">阅读量</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">数据监控频率</label>
                    <select className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500">
                      <option>每小时</option>
                      <option>每4小时</option>
                      <option>每天</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Data Retention */}
              <div className="bg-white border border-gray-200 rounded p-4">
                <div className="text-xs font-medium text-gray-900 mb-3">数据管理</div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">数据保留时长</label>
                  <select className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500">
                    <option>30天</option>
                    <option>60天</option>
                    <option>90天</option>
                    <option>永久保留</option>
                  </select>
                </div>
              </div>

              {/* Langfuse Monitoring */}
              <div className="bg-white border border-gray-200 rounded p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-500" />
                    <div className="text-xs font-medium text-gray-900">LLM 监控 (Langfuse)</div>
                    {langfuseConfig?.configured && langfuseConfig?.enabled && (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    )}
                  </div>
                  {langfuseConfig?.configured && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={langfuseConfig?.enabled ?? false}
                        onChange={(e) => handleToggleLangfuse(e.target.checked)}
                        className="w-3.5 h-3.5 text-purple-500 rounded"
                      />
                      <span className="text-xs text-gray-600">启用</span>
                    </label>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  追踪和分析所有 LLM 调用，查看 token 使用量、延迟和成本
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowLangfuseModal(true)}
                    className="px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    {langfuseConfig?.configured ? '重新配置' : '配置 Langfuse'}
                  </button>
                  {langfuseConfig?.configured && langfuseConfig?.endpoint && (
                    <a
                      href={langfuseConfig.endpoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs text-purple-600 hover:text-purple-700"
                    >
                      打开控制台 →
                    </a>
                  )}
                </div>
              </div>

              {/* Tavily Web Search */}
              <div className="bg-white border border-gray-200 rounded p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <div className="text-xs font-medium text-gray-900">联网搜索 (Tavily)</div>
                    {tavilyConfig?.configured && tavilyConfig?.enabled && (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    )}
                  </div>
                  {tavilyConfig?.configured && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tavilyConfig?.enabled ?? false}
                        onChange={(e) => handleToggleTavily(e.target.checked)}
                        className="w-3.5 h-3.5 text-blue-500 rounded"
                      />
                      <span className="text-xs text-gray-600">启用</span>
                    </label>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  联网搜索最新热点和趋势，支持获取小红书、知乎等平台内容
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTavilyModal(true)}
                    className="px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    {tavilyConfig?.configured ? '重新配置' : '配置 Tavily'}
                  </button>
                  {tavilyConfig?.configured && (
                    <a
                      href="https://app.tavily.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700"
                    >
                      获取 API Key →
                    </a>
                  )}
                </div>
              </div>

              <button className="px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                保存设置
              </button>
            </div>

            {/* Langfuse Config Modal */}
            {showLangfuseModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-purple-500" />
                    <div className="text-sm font-medium text-gray-900">配置 Langfuse</div>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Langfuse 是一个开源的 LLM 可观测性平台，用于追踪、评估和调试 LLM 应用。
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Endpoint URL</label>
                      <input
                        ref={el => { langfuseFormRef.endpoint = el; }}
                        type="text"
                        defaultValue={langfuseConfig?.endpoint || 'http://localhost:23022'}
                        placeholder="http://localhost:23022"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Public Key</label>
                      <input
                        ref={el => { langfuseFormRef.publicKey = el; }}
                        type="text"
                        defaultValue={langfuseConfig?.publicKey}
                        placeholder="pk-lf-..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">
                        Secret Key {langfuseConfig?.hasSecretKey && <span className="text-green-600">(已配置)</span>}
                      </label>
                      <input
                        ref={el => { langfuseFormRef.secretKey = el; }}
                        type="password"
                        placeholder={langfuseConfig?.hasSecretKey ? '留空保持不变' : 'sk-lf-...'}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setShowLangfuseModal(false)}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveLangfuse}
                      disabled={langfuseSaving}
                      className="flex-1 px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors disabled:opacity-50"
                    >
                      {langfuseSaving ? '保存中...' : '保存并启用'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tavily Config Modal */}
            {showTavilyModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <div className="text-sm font-medium text-gray-900">配置 Tavily 联网搜索</div>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Tavily 是一个专为 AI 设计的搜索引擎，可以快速获取网页内容用于研究和趋势分析。
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Endpoint</label>
                      <input
                        ref={el => { tavilyFormRef.endpoint = el; }}
                        type="text"
                        defaultValue={tavilyConfig?.endpoint || 'https://api.tavily.com/search'}
                        placeholder="https://api.tavily.com/search"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">
                        API Key {tavilyConfig?.hasApiKey && <span className="text-green-600">(已配置)</span>}
                      </label>
                      <input
                        ref={el => { tavilyFormRef.apiKey = el; }}
                        type="password"
                        placeholder={tavilyConfig?.hasApiKey ? '留空保持不变' : 'tvly-...'}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setShowTavilyModal(false)}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveTavily}
                      disabled={tavilySaving}
                      className="flex-1 px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                    >
                      {tavilySaving ? '保存中...' : '保存并启用'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
