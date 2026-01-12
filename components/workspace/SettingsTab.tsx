import { useState, useEffect } from 'react';
import { Key, Database, Settings as SettingsIcon, QrCode, Smartphone, CheckCircle, Loader, Plus, Edit2, Trash2, FlaskConical } from 'lucide-react';
import type { Theme } from '../../App';
import { PromptPlayground } from './PromptPlayground';

interface SettingsTabProps {
  theme: Theme;
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
}

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

const defaultExtensionTypes = [
  { service_type: 'image', name: '图像生成', description: 'AI 图像生成服务（如 DALL-E、Midjourney）' },
  { service_type: 'imagehost', name: '图床', description: '图片存储与 CDN 服务' },
  { service_type: 'video', name: '视频处理', description: '视频编辑、转码和存储服务' },
  { service_type: 'tts', name: '文本转语音', description: 'TTS 文本转语音服务' },
  { service_type: 'nanobanana', name: 'Nanobanana', description: '第三方数据分析服务' }
];

export function SettingsTab({ theme: _theme }: SettingsTabProps) {
  const [activeSection, setActiveSection] = useState<SettingSection>('hotNumber');
  const [qrStatus, setQrStatus] = useState<'loading' | 'ready' | 'success'>('ready');
  const [selectedAPI, setSelectedAPI] = useState<string | null>(null);
  const [selectedLLM, setSelectedLLM] = useState<LLMConfig | null>(null);
  const [showLLMModal, setShowLLMModal] = useState(false);
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [extensionServices, setExtensionServices] = useState<ExtensionService[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [rulesSubTab, setRulesSubTab] = useState<'manage' | 'test'>('manage');
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);

  // Load data on mount
  useEffect(() => {
    loadLlmProviders();
    loadPromptProfiles();
    loadExtensionServices();
  }, []);

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
      let data: any[];
      if (window.promptProfiles) {
        data = await window.promptProfiles.list();
      } else {
        const res = await fetch('/api/prompt-profiles');
        data = await res.json();
      }
      setPromptTemplates(data);
    } catch (e) {
      console.error('Failed to load prompt profiles:', e);
    }
  };

  const loadExtensionServices = async () => {
    try {
      let data: any[];
      if (window.extensionServices) {
        data = await window.extensionServices.list();
      } else {
        const res = await fetch('/api/extension-services');
        data = await res.json();
      }
      setExtensionServices(data);
    } catch (e) {
      console.error('Failed to load extension services:', e);
    }
  };

  const sections = [
    { id: 'hotNumber' as const, label: '热号测控', sublabel: '连接小红书账号', icon: QrCode },
    { id: 'api' as const, label: 'API配置', sublabel: '管理 LLM 模型', icon: Key },
    { id: 'rules' as const, label: '规则训练库', sublabel: '自定义生成规则', icon: Database },
    { id: 'system' as const, label: '系统参数', sublabel: '自动化与数据', icon: SettingsIcon }
  ];

  const handleScanQR = async () => {
    setQrStatus('loading');
    try {
      if (window.auth) {
        await window.auth.login();
        setQrStatus('success');
      } else {
        // Fallback for web mode
        const res = await fetch('/api/auth/login', { method: 'POST' });
        if (res.ok) {
          setQrStatus('success');
        } else {
          setQrStatus('ready');
        }
      }
    } catch (e) {
      console.error('Login failed:', e);
      setQrStatus('ready');
    }
  };

  const handleLogout = async () => {
    try {
      if (window.auth) {
        await window.auth.logout();
      }
      setQrStatus('ready');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  // Check login status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (window.auth) {
          const status = await window.auth.checkStatus();
          if (status.loggedIn) {
            setQrStatus('success');
          }
        }
      } catch (e) {
        console.error('Check status failed:', e);
      }
    };
    checkAuth();
  }, []);

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
          <div className="max-w-4xl">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-900">热号测控</h2>
              <p className="text-xs text-gray-500 mt-0.5">连接小红书账号</p>
            </div>

            {/* Status */}
            <div className="bg-white border border-gray-200 rounded p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-xs font-medium text-gray-900">正在协商登录状态</div>
                {qrStatus === 'loading' && <Loader className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                {qrStatus === 'ready' && <div className="text-xs text-gray-500">请稍候...</div>}
                {qrStatus === 'success' && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="w-3 h-3" />
                    已连接
                  </div>
                )}
              </div>
            </div>

            {/* Action Items */}
            <div className="space-y-2">
              {/* Open App */}
              <div className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    qrStatus === 'success' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <Smartphone className={`w-3 h-3 ${
                      qrStatus === 'success' ? 'text-red-500' : 'text-gray-500'
                    }`} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-900">打开小红书 APP</div>
                    <div className="text-xs text-gray-500">确保已普通的小红书账号</div>
                  </div>
                </div>
                {qrStatus === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>

              {/* Auto QR Code */}
              <div className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-between ${
                    qrStatus === 'loading' || qrStatus === 'success' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <QrCode className={`w-3 h-3 ${
                      qrStatus === 'loading' || qrStatus === 'success' ? 'text-red-500' : 'text-gray-500'
                    }`} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-900">自动二维码</div>
                    <div className="text-xs text-gray-500">通过扫码登录门，在弹出口扫码</div>
                  </div>
                </div>
                {qrStatus === 'loading' && <Loader className="w-4 h-4 text-blue-500 animate-spin" />}
                {qrStatus === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>

              {/* Save Credentials */}
              <div className="bg-white border border-gray-200 rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    qrStatus === 'success' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    <Database className={`w-3 h-3 ${
                      qrStatus === 'success' ? 'text-red-500' : 'text-gray-500'
                    }`} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-900">保存凭据</div>
                    <div className="text-xs text-gray-500">登录凭据已自动保存前</div>
                  </div>
                </div>
                {qrStatus === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
            </div>

            {qrStatus === 'ready' && (
              <div className="mt-4">
                <button
                  onClick={handleScanQR}
                  className="px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  开始连接
                </button>
              </div>
            )}

            {qrStatus === 'success' && (
              <div className="mt-4">
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        )}

        {activeSection === 'api' && (
          <div className="max-w-4xl">
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
                          onClick={() => {
                            setLlmConfigs(llmConfigs.filter(c => c.id !== config.id));
                          }}
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
                        type="text"
                        defaultValue={selectedLLM?.name}
                        placeholder="例如：GPT-4"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Provider</label>
                      <select
                        defaultValue={selectedLLM?.provider_type}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                        <option>OpenAI</option>
                        <option>Anthropic</option>
                        <option>Google AI</option>
                        <option>Azure OpenAI</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Key</label>
                      <input
                        type="password"
                        placeholder="sk-..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Model</label>
                      <input
                        type="text"
                        defaultValue={selectedLLM?.model_name}
                        placeholder="gpt-4"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
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
                      onClick={() => {
                        setShowLLMModal(false);
                        setSelectedLLM(null);
                      }}
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
                        type="password"
                        placeholder="输入 API Key"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">API Endpoint (可选)</label>
                      <input
                        type="text"
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
                      onClick={() => setSelectedAPI(null)}
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

        {activeSection === 'rules' && (
          <div className="max-w-6xl">
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
                          onClick={() => {
                            setPromptTemplates(promptTemplates.filter(p => p.id !== prompt.id));
                          }}
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
              <PromptPlayground prompts={promptTemplates} />
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
                        type="text"
                        defaultValue={selectedPrompt?.name}
                        placeholder="例如：小红书爆款标题"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">分类</label>
                      <select
                        defaultValue={selectedPrompt?.category}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                        <option>标题生成</option>
                        <option>正文生成</option>
                        <option>互动回复</option>
                        <option>其他</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">描述</label>
                      <input
                        type="text"
                        defaultValue={selectedPrompt?.description}
                        placeholder="简短描述这个提示词的用途"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">提示词内容</label>
                      <textarea
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
                      onClick={() => {
                        setShowPromptModal(false);
                        setSelectedPrompt(null);
                      }}
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
          <div className="max-w-4xl">
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

              <button className="px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                保存设置
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}