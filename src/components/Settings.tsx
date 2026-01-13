import { useState, useEffect } from 'react';
import { Key, QrCode, Zap, Save, Loader2, CheckCircle, XCircle, LogOut, Eye, EyeOff } from 'lucide-react';

type AuthStatus = 'checking' | 'logged_in' | 'logged_out' | 'logging_in' | 'error';

export function Settings() {
  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ userId?: string } | null>(null);

  // API config state
  const [apiConfig, setApiConfig] = useState({ openaiKey: '', openaiBaseUrl: '', openaiModel: '', imageKey: '' });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savingApi, setSavingApi] = useState(false);

  // System params state
  const [systemParams, setSystemParams] = useState({
    cleanThreshold: 100,
    monitorFreq: 'hourly',
    dataRetention: '30',
    autoReply: true,
    competitorMonitor: true,
    autoClean: true
  });
  const [savingSystem, setSavingSystem] = useState(false);

  useEffect(() => {
    checkAuthStatus();
    loadSettings();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setAuthStatus('checking');
      if (window.auth) {
        const result = await window.auth.checkStatus();
        setAuthStatus(result.loggedIn ? 'logged_in' : 'logged_out');
        setProfile(result.loggedIn ? result.profile : null);
      } else {
        const res = await fetch('/api/auth/status');
        const result = await res.json();
        setAuthStatus(result.loggedIn ? 'logged_in' : 'logged_out');
        setProfile(result.loggedIn ? result.profile : null);
      }
      setAuthError(null);
    } catch (err: any) {
      setAuthStatus('error');
      setAuthError(err.message || '检查登录状态失败');
    }
  };

  const handleLogin = async () => {
    try {
      setAuthStatus('logging_in');
      setAuthError(null);
      const result = window.auth
        ? await window.auth.login({ timeout: 300 })
        : await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeout: 300 }) })).json();
      if (result.success) {
        setAuthStatus('logged_in');
        setProfile(result.profile || null);
      } else {
        setAuthStatus('logged_out');
        setAuthError(result.message || '登录失败');
      }
    } catch (err: any) {
      setAuthStatus('error');
      setAuthError(err.message || '登录失败');
    }
  };

  const handleLogout = async () => {
    try {
      window.auth ? await window.auth.logout() : await fetch('/api/auth/logout', { method: 'POST' });
      setAuthStatus('logged_out');
      setProfile(null);
      setAuthError(null);
    } catch (err: any) {
      setAuthError(err.message || '退出登录失败');
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setApiConfig({
        openaiKey: '',
        openaiBaseUrl: data.openaiBaseUrl || '',
        openaiModel: data.openaiModel || '',
        imageKey: ''
      });
      setSystemParams({
        cleanThreshold: data.cleanThreshold || 100,
        monitorFreq: data.monitorFreq || 'hourly',
        dataRetention: data.dataRetention || '30',
        autoReply: data.autoReply !== false,
        competitorMonitor: data.competitorMonitor !== false,
        autoClean: data.autoClean !== false
      });
    } catch {}
  };

  const saveApiConfig = async () => {
    setSavingApi(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiConfig)
      });
    } finally {
      setSavingApi(false);
    }
  };

  const saveSystemParams = async () => {
    setSavingSystem(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(systemParams)
      });
    } finally {
      setSavingSystem(false);
    }
  };

  const toggleKey = (key: string) => setShowKeys(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="h-full space-y-3 p-4 overflow-y-auto">
      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Account Authorization */}
        <div className="bg-white border border-gray-200 rounded">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs font-medium text-gray-900">账号授权</span>
          </div>
          <div className="p-4">
            {authStatus === 'checking' && (
              <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                <div className="text-xs text-gray-600">正在检查登录状态...</div>
              </div>
            )}

            {authStatus === 'logging_in' && (
              <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center">
                <div className="w-40 h-40 bg-white border-2 border-dashed border-gray-300 rounded mx-auto flex items-center justify-center mb-3">
                  <QrCode className="w-20 h-20 text-gray-300" />
                </div>
                <div className="text-xs text-gray-600 mb-3">使用小红书 APP 扫描二维码登录</div>
                <div className="text-xs text-red-500">等待扫码中...</div>
              </div>
            )}

            {authStatus === 'logged_in' && (
              <div className="bg-green-50 border border-green-200 rounded p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-900">已连接小红书账号</div>
                    {profile?.userId && <div className="text-xs text-gray-500 mt-0.5">用户ID: {profile.userId}</div>}
                  </div>
                  <button onClick={handleLogout} className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors flex items-center gap-1">
                    <LogOut className="w-3 h-3" />
                    退出
                  </button>
                </div>
              </div>
            )}

            {(authStatus === 'logged_out' || authStatus === 'error') && (
              <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center">
                <div className="w-40 h-40 bg-white border-2 border-dashed border-gray-300 rounded mx-auto flex items-center justify-center mb-3">
                  <XCircle className="w-20 h-20 text-gray-300" />
                </div>
                <div className="text-xs text-gray-600 mb-3">点击下方按钮开始登录</div>
                <button onClick={handleLogin} className="px-4 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                  开始登录
                </button>
              </div>
            )}

            {authError && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded">
                <div className="text-xs text-red-700">{authError}</div>
              </div>
            )}

            <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded">
              <div className="text-xs text-blue-900 font-medium mb-0.5">提示</div>
              <div className="text-xs text-blue-700">登录后可使用小红书数据抓取和发布功能</div>
            </div>
          </div>
        </div>

        {/* API Configuration */}
        <div className="bg-white border border-gray-200 rounded">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs font-medium text-gray-900">API 配置</span>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">OpenAI Base URL</label>
                <input
                  type="text"
                  value={apiConfig.openaiBaseUrl}
                  onChange={(e) => setApiConfig({ ...apiConfig, openaiBaseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">OpenAI API Key</label>
                <div className="relative">
                  <input
                    type={showKeys.openai ? 'text' : 'password'}
                    value={apiConfig.openaiKey}
                    onChange={(e) => setApiConfig({ ...apiConfig, openaiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 pr-9 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
                  />
                  <button type="button" onClick={() => toggleKey('openai')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showKeys.openai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">用于内容生成和智能分析功能</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">模型名称</label>
                <input
                  type="text"
                  value={apiConfig.openaiModel}
                  onChange={(e) => setApiConfig({ ...apiConfig, openaiModel: e.target.value })}
                  placeholder="gpt-4-turbo-preview"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">图像生成 API Key</label>
                <div className="relative">
                  <input
                    type={showKeys.image ? 'text' : 'password'}
                    value={apiConfig.imageKey}
                    onChange={(e) => setApiConfig({ ...apiConfig, imageKey: e.target.value })}
                    placeholder="your-api-key"
                    className="w-full px-3 py-2 pr-9 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
                  />
                  <button type="button" onClick={() => toggleKey('image')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showKeys.image ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">用于 AI 图像生成功能</div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <button onClick={saveApiConfig} disabled={savingApi} className="flex items-center gap-1.5 px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50">
                {savingApi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                保存配置
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* System Parameters - Full Width */}
      <div className="bg-white border border-gray-200 rounded">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-gray-700" />
          <span className="text-xs font-medium text-gray-900">系统参数</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">自动清理阈值</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={systemParams.cleanThreshold}
                  onChange={(e) => setSystemParams({ ...systemParams, cleanThreshold: parseInt(e.target.value) || 0 })}
                  className="w-20 px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <span className="text-xs text-gray-600">阅读量</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">发布24小时后，低于此值将自动隐藏</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">数据监控频率</label>
              <select
                value={systemParams.monitorFreq}
                onChange={(e) => setSystemParams({ ...systemParams, monitorFreq: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="hourly">每小时</option>
                <option value="4hours">每4小时</option>
                <option value="daily">每天</option>
              </select>
              <div className="text-xs text-gray-500 mt-1">定时抓取数据和分析竞品动态</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">数据保留时长</label>
              <select
                value={systemParams.dataRetention}
                onChange={(e) => setSystemParams({ ...systemParams, dataRetention: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="30">30天</option>
                <option value="60">60天</option>
                <option value="90">90天</option>
                <option value="forever">永久保留</option>
              </select>
              <div className="text-xs text-gray-500 mt-1">历史数据和笔记的保留期限</div>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-xs font-medium text-gray-900 mb-3">自动化功能</label>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <label className="flex items-start gap-2 p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemParams.autoReply}
                  onChange={(e) => setSystemParams({ ...systemParams, autoReply: e.target.checked })}
                  className="w-3.5 h-3.5 text-red-500 rounded mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-900">启用自动回复</div>
                  <div className="text-xs text-gray-500 mt-0.5">自动回复笔记评论，提升互动率</div>
                </div>
              </label>

              <label className="flex items-start gap-2 p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemParams.competitorMonitor}
                  onChange={(e) => setSystemParams({ ...systemParams, competitorMonitor: e.target.checked })}
                  className="w-3.5 h-3.5 text-red-500 rounded mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-900">启用竞品监控</div>
                  <div className="text-xs text-gray-500 mt-0.5">每日自动抓取竞品账号的最新笔记</div>
                </div>
              </label>

              <label className="flex items-start gap-2 p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemParams.autoClean}
                  onChange={(e) => setSystemParams({ ...systemParams, autoClean: e.target.checked })}
                  className="w-3.5 h-3.5 text-red-500 rounded mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-900">启用自动清理</div>
                  <div className="text-xs text-gray-500 mt-0.5">低质量内容达到阈值后自动删除或隐藏</div>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <button onClick={saveSystemParams} disabled={savingSystem} className="flex items-center gap-1.5 px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50">
              {savingSystem ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
