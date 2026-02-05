import { Activity, CheckCircle, Globe } from 'lucide-react';
import type { LangfuseConfig, TavilyConfig } from './types';

interface SystemSettingsSectionProps {
  captureEnabled: boolean;
  handleCaptureToggle: (enabled: boolean) => void;
  langfuseConfig: LangfuseConfig | null;
  showLangfuseModal: boolean;
  setShowLangfuseModal: (open: boolean) => void;
  handleSaveLangfuse: () => void;
  handleToggleLangfuse: (enabled: boolean) => void;
  langfuseFormRef: {
    secretKey: HTMLInputElement | null;
    publicKey: HTMLInputElement | null;
    endpoint: HTMLInputElement | null;
  };
  langfuseSaving: boolean;
  tavilyConfig: TavilyConfig | null;
  showTavilyModal: boolean;
  setShowTavilyModal: (open: boolean) => void;
  handleSaveTavily: () => void;
  handleToggleTavily: (enabled: boolean) => void;
  tavilyFormRef: {
    apiKey: HTMLInputElement | null;
    endpoint: HTMLInputElement | null;
  };
  tavilySaving: boolean;
}

export function SystemSettingsSection({
  captureEnabled,
  handleCaptureToggle,
  langfuseConfig,
  showLangfuseModal,
  setShowLangfuseModal,
  handleSaveLangfuse,
  handleToggleLangfuse,
  langfuseFormRef,
  langfuseSaving,
  tavilyConfig,
  showTavilyModal,
  setShowTavilyModal,
  handleSaveTavily,
  handleToggleTavily,
  tavilyFormRef,
  tavilySaving,
}: SystemSettingsSectionProps) {
  return (
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
            <p className="text-xs text-gray-500 mb-3">
              Langfuse 是一个开源的 LLM 可观测性平台，用于追踪、评估和调试 LLM 应用。
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1">Public Key</label>
                <input
                  ref={el => { langfuseFormRef.publicKey = el; }}
                  type="text"
                  defaultValue={langfuseConfig?.publicKey}
                  placeholder="pk-..."
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">Secret Key</label>
                <input
                  ref={el => { langfuseFormRef.secretKey = el; }}
                  type="password"
                  placeholder="sk-..."
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">Endpoint</label>
                <input
                  ref={el => { langfuseFormRef.endpoint = el; }}
                  type="text"
                  defaultValue={langfuseConfig?.endpoint}
                  placeholder="https://cloud.langfuse.com"
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
                保存
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
            <p className="text-xs text-gray-500 mb-3">
              Tavily 是一个专为 AI 设计的搜索引擎，可以快速获取网页内容用于研究和趋势分析。
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-700 mb-1">API Key</label>
                <input
                  ref={el => { tavilyFormRef.apiKey = el; }}
                  type="password"
                  placeholder="tvly-..."
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">Endpoint (可选)</label>
                <input
                  ref={el => { tavilyFormRef.endpoint = el; }}
                  type="text"
                  defaultValue={tavilyConfig?.endpoint}
                  placeholder="https://api.tavily.com"
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
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
