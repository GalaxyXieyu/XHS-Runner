import { CheckCircle, Edit2, Key, Plus, Trash2 } from 'lucide-react';
import type { ExtensionService, LLMConfig } from './types';

interface ApiSettingsSectionProps {
  llmConfigs: LLMConfig[];
  selectedLLM: LLMConfig | null;
  showLLMModal: boolean;
  setShowLLMModal: (open: boolean) => void;
  setSelectedLLM: (config: LLMConfig | null) => void;
  handleDeleteLLM: (id: number) => void;
  handleSaveLLM: () => void;
  llmFormRef: {
    name: HTMLInputElement | null;
    provider: HTMLSelectElement | null;
    baseUrl: HTMLInputElement | null;
    apiKey: HTMLInputElement | null;
    model: HTMLInputElement | null;
    supportsVision: HTMLInputElement | null;
    supportsImageGen: HTMLInputElement | null;
  };
  extensionServices: ExtensionService[];
  selectedAPI: string | null;
  setSelectedAPI: (serviceType: string | null) => void;
  handleSaveExtension: () => void;
  extensionFormRef: {
    apiKey: HTMLInputElement | null;
    endpoint: HTMLInputElement | null;
  };
  defaultExtensionTypes: { service_type: string; name: string; description: string }[];
  jimengConfigured: boolean;
  showJimengModal: boolean;
  setShowJimengModal: (open: boolean) => void;
  jimengConfig: { apiKey: string; endpointId: string };
  setJimengConfig: (next: { apiKey: string; endpointId: string }) => void;
  handleSaveJimeng: () => void;
  jimengSaving: boolean;
}

export function ApiSettingsSection({
  llmConfigs,
  selectedLLM,
  showLLMModal,
  setShowLLMModal,
  setSelectedLLM,
  handleDeleteLLM,
  handleSaveLLM,
  llmFormRef,
  extensionServices,
  selectedAPI,
  setSelectedAPI,
  handleSaveExtension,
  extensionFormRef,
  defaultExtensionTypes,
  jimengConfigured,
  showJimengModal,
  setShowJimengModal,
  jimengConfig,
  setJimengConfig,
  handleSaveJimeng,
  jimengSaving,
}: ApiSettingsSectionProps) {
  return (
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
  );
}
