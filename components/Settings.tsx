import { useState, useEffect } from 'react';
import { Key, QrCode, Zap, Save, LogOut, Loader2, CheckCircle, XCircle } from 'lucide-react';

declare global {
  interface Window {
    auth?: {
      login: (options?: { timeout?: number }) => Promise<any>;
      logout: () => Promise<any>;
      checkStatus: () => Promise<any>;
    };
  }
}

type AuthStatus = 'checking' | 'logged_in' | 'logged_out' | 'logging_in' | 'error';

export function Settings() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ userId?: string } | null>(null);

  const [apiConfig, setApiConfig] = useState({
    openaiKey: '',
    imageKey: ''
  });

  const [systemParams, setSystemParams] = useState({
    cleanThreshold: 100,
    monitorFreq: 'hourly',
    autoReply: true,
    competitorMonitor: true,
    autoClean: true
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setAuthStatus('checking');
      // 优先使用 Electron IPC，否则使用 Web API
      if (window.auth) {
        const result = await window.auth.checkStatus();
        if (result.loggedIn) {
          setAuthStatus('logged_in');
          setProfile(result.profile || null);
        } else {
          setAuthStatus('logged_out');
          setProfile(null);
        }
      } else {
        const res = await fetch('/api/auth/status');
        const result = await res.json();
        if (result.loggedIn) {
          setAuthStatus('logged_in');
          setProfile(result.profile || null);
        } else {
          setAuthStatus('logged_out');
          setProfile(null);
        }
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
      let result;
      if (window.auth) {
        result = await window.auth.login({ timeout: 300 });
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeout: 300 }),
        });
        result = await res.json();
      }
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
      if (window.auth) {
        await window.auth.logout();
      } else {
        await fetch('/api/auth/logout', { method: 'POST' });
      }
      setAuthStatus('logged_out');
      setProfile(null);
      setAuthError(null);
    } catch (err: any) {
      setAuthError(err.message || '退出登录失败');
    }
  };

  return (
    <div className="h-full space-y-3">
      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Account Authorization */}
        <div className="bg-white border border-gray-200 rounded">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs font-medium text-gray-900">账号授权</span>
          </div>
          <div className="p-4">
            <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center">
              {authStatus === 'checking' && (
                <>
                  <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-3 animate-spin" />
                  <div className="text-xs text-gray-600">正在检查登录状态...</div>
                </>
              )}
              {authStatus === 'logging_in' && (
                <>
                  <Loader2 className="w-12 h-12 text-red-500 mx-auto mb-3 animate-spin" />
                  <div className="text-xs text-gray-600 mb-2">请在弹出的浏览器窗口中扫码登录</div>
                  <div className="text-xs text-gray-500">登录成功后窗口会自动关闭</div>
                </>
              )}
              {authStatus === 'logged_in' && (
                <>
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <div className="text-xs text-green-700 font-medium mb-1">已登录</div>
                  {profile?.userId && (
                    <div className="text-xs text-gray-500 mb-3">用户ID: {profile.userId}</div>
                  )}
                  <button
                    onClick={handleLogout}
                    className="px-4 py-1.5 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors inline-flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    退出登录
                  </button>
                </>
              )}
              {(authStatus === 'logged_out' || authStatus === 'error') && (
                <>
                  <XCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <div className="text-xs text-gray-600 mb-3">未登录，点击下方按钮开始登录</div>
                  <button
                    onClick={handleLogin}
                    className="px-4 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >
                    开始登录
                  </button>
                </>
              )}
            </div>
            {authError && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded">
                <div className="text-xs text-red-700">{authError}</div>
              </div>
            )}
            <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded">
              <div className="text-xs text-blue-900 font-medium mb-0.5">提示</div>
              <div className="text-xs text-blue-700">
                点击"开始登录"后会打开浏览器窗口，请使用小红书 APP 扫描二维码完成登录
              </div>
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
              {/* OpenAI API Key */}
              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={apiConfig.openaiKey}
                  onChange={(e) => setApiConfig({ ...apiConfig, openaiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <div className="text-xs text-gray-500 mt-1">用于内容生成和智能分析功能</div>
              </div>

              {/* Image Generation API Key */}
              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1.5">
                  图像生成 API Key
                </label>
                <input
                  type="password"
                  value={apiConfig.imageKey}
                  onChange={(e) => setApiConfig({ ...apiConfig, imageKey: e.target.value })}
                  placeholder="your-api-key"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <div className="text-xs text-gray-500 mt-1">用于 AI 图像生成功能</div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <button className="flex items-center gap-1.5 px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                <Save className="w-3 h-3" />
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
            {/* Clean Threshold */}
            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">
                自动清理阈值
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={systemParams.cleanThreshold}
                  onChange={(e) => setSystemParams({ ...systemParams, cleanThreshold: parseInt(e.target.value) })}
                  className="w-20 px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <span className="text-xs text-gray-600">阅读量</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">发布24小时后，低于此值将自动隐藏</div>
            </div>

            {/* Monitor Frequency */}
            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">
                数据监控频率
              </label>
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

            {/* Placeholder for balance */}
            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">
                数据保留时长
              </label>
              <select className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent">
                <option value="30">30天</option>
                <option value="60">60天</option>
                <option value="90">90天</option>
                <option value="forever">永久保留</option>
              </select>
              <div className="text-xs text-gray-500 mt-1">历史数据和笔记的保留期限</div>
            </div>
          </div>

          {/* Auto Features */}
          <div className="mt-6">
            <label className="block text-xs font-medium text-gray-900 mb-3">
              自动化功能
            </label>
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
            <button className="flex items-center gap-1.5 px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
              <Save className="w-3 h-3" />
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
