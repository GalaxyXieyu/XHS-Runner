import { useState, useEffect } from 'react';
import { Key, Database, Settings as SettingsIcon, QrCode, Smartphone, CheckCircle, Loader } from 'lucide-react';
import type { Theme } from '@/App';
import type { AuthStatus } from '@/hooks/useAuthStatus';
import { ApiSettingsSection } from './settings/ApiSettingsSection';
import { SystemSettingsSection } from './settings/SystemSettingsSection';
import { RulesSettingsSection } from './settings/RulesSettingsSection';
import type { ExtensionService, LangfuseConfig, LLMConfig, TavilyConfig } from './settings/types';

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

interface PromptTemplate {
  id: number;
  name: string;
  category: string;
  system_prompt: string;
  user_template: string;
  description: string;
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
          <ApiSettingsSection
            llmConfigs={llmConfigs}
            selectedLLM={selectedLLM}
            showLLMModal={showLLMModal}
            setShowLLMModal={setShowLLMModal}
            setSelectedLLM={setSelectedLLM}
            handleDeleteLLM={handleDeleteLLM}
            handleSaveLLM={handleSaveLLM}
            llmFormRef={llmFormRef}
            extensionServices={extensionServices}
            selectedAPI={selectedAPI}
            setSelectedAPI={setSelectedAPI}
            handleSaveExtension={handleSaveExtension}
            extensionFormRef={extensionFormRef}
            defaultExtensionTypes={defaultExtensionTypes}
            jimengConfigured={jimengConfigured}
            showJimengModal={showJimengModal}
            setShowJimengModal={setShowJimengModal}
            jimengConfig={jimengConfig}
            setJimengConfig={setJimengConfig}
            handleSaveJimeng={handleSaveJimeng}
            jimengSaving={jimengSaving}
          />
        )}

        {activeSection === 'rules' && (
          <RulesSettingsSection
            rulesSubTab={rulesSubTab}
            setRulesSubTab={setRulesSubTab}
            promptTemplates={promptTemplates}
            selectedPrompt={selectedPrompt}
            setSelectedPrompt={setSelectedPrompt}
            showPromptModal={showPromptModal}
            setShowPromptModal={setShowPromptModal}
            handleDeletePrompt={handleDeletePrompt}
            handleSavePrompt={handleSavePrompt}
            promptFormRef={promptFormRef}
          />
        )}

        {activeSection === 'system' && (
          <SystemSettingsSection
            captureEnabled={captureEnabled}
            handleCaptureToggle={handleCaptureToggle}
            langfuseConfig={langfuseConfig}
            showLangfuseModal={showLangfuseModal}
            setShowLangfuseModal={setShowLangfuseModal}
            handleSaveLangfuse={handleSaveLangfuse}
            handleToggleLangfuse={handleToggleLangfuse}
            langfuseFormRef={langfuseFormRef}
            langfuseSaving={langfuseSaving}
            tavilyConfig={tavilyConfig}
            showTavilyModal={showTavilyModal}
            setShowTavilyModal={setShowTavilyModal}
            handleSaveTavily={handleSaveTavily}
            handleToggleTavily={handleToggleTavily}
            tavilyFormRef={tavilyFormRef}
            tavilySaving={tavilySaving}
          />
        )}
      </div>
    </div>
  );
}
