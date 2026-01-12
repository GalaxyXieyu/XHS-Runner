import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, LogOut, Smartphone, ScanLine, Shield } from 'lucide-react';

type AuthStatus = 'checking' | 'logged_in' | 'logged_out' | 'logging_in' | 'error';

export function AccountTab() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ userId?: string } | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setAuthStatus('checking');
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
    <div className="space-y-5 max-w-2xl">
      {/* 状态卡片 */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="p-6">
          {authStatus === 'checking' && (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-gray-400 animate-spin" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">正在检查登录状态</div>
                <div className="text-xs text-gray-500 mt-0.5">请稍候...</div>
              </div>
            </div>
          )}

          {authStatus === 'logging_in' && (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-red-50 rounded-lg flex items-center justify-center">
                <ScanLine className="w-7 h-7 text-red-500 animate-pulse" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">等待扫码登录</div>
                <div className="text-xs text-gray-500 mt-0.5">请在弹出的浏览器窗口中扫码</div>
              </div>
            </div>
          )}

          {authStatus === 'logged_in' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-green-50 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-7 h-7 text-green-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">已连接小红书账号</div>
                  {profile?.userId && (
                    <div className="text-xs text-gray-500 mt-0.5">用户ID: {profile.userId}</div>
                  )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                退出登录
              </button>
            </div>
          )}

          {(authStatus === 'logged_out' || authStatus === 'error') && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center">
                  <XCircle className="w-7 h-7 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">未连接账号</div>
                  <div className="text-xs text-gray-500 mt-0.5">点击右侧按钮开始登录</div>
                </div>
              </div>
              <button
                onClick={handleLogin}
                className="px-5 py-2.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                开始登录
              </button>
            </div>
          )}
        </div>

        {authError && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100">
            <div className="text-xs text-red-600">{authError}</div>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
        <div className="text-xs font-semibold text-gray-900 mb-4">登录步骤</div>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div>
              <div className="text-xs font-medium text-gray-800">打开小红书 APP</div>
              <div className="text-[11px] text-gray-500 mt-0.5">确保已登录你的小红书账号</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <ScanLine className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div>
              <div className="text-xs font-medium text-gray-800">扫描二维码</div>
              <div className="text-[11px] text-gray-500 mt-0.5">点击"开始登录"后，在弹出窗口扫码</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div>
              <div className="text-xs font-medium text-gray-800">授权完成</div>
              <div className="text-[11px] text-gray-500 mt-0.5">登录成功后窗口会自动关闭</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
