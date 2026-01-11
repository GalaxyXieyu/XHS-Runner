import { useState } from 'react';
import { User, Key, FileText, Settings as SettingsIcon } from 'lucide-react';
import { AccountTab } from './settings/AccountTab';
import { ApiConfigTab } from './settings/ApiConfigTab';
import { PromptTemplateTab } from './settings/PromptTemplateTab';
import { SystemParamsTab } from './settings/SystemParamsTab';

type TabId = 'account' | 'api' | 'prompts' | 'system';

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'account', label: '账号授权', icon: <User className="w-3.5 h-3.5" /> },
  { id: 'api', label: 'API 配置', icon: <Key className="w-3.5 h-3.5" /> },
  { id: 'prompts', label: '提示词模板', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'system', label: '系统参数', icon: <SettingsIcon className="w-3.5 h-3.5" /> },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('account');

  return (
    <div className="h-full flex bg-white rounded border border-gray-200 overflow-hidden">
      {/* 左侧导航 */}
      <div className="w-40 bg-gray-50 border-r border-gray-200 flex-shrink-0">
        <div className="px-3 py-2 border-b border-gray-100">
          <h2 className="text-xs font-medium text-gray-900">系统设置</h2>
        </div>
        <nav className="p-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                activeTab === tab.id
                  ? 'bg-red-50 text-red-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'api' && <ApiConfigTab />}
        {activeTab === 'prompts' && <PromptTemplateTab />}
        {activeTab === 'system' && <SystemParamsTab />}
      </div>
    </div>
  );
}
