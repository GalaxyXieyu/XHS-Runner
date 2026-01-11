import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, LogOut, Info } from 'lucide-react';

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
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">小红书账号</h3>
        <p className="text-xs text-gray-500">连接你的小红书账号以使用数据抓取功能</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
        {authStatus === 'checking' && (
          <>
            <Loader2 className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-spin" />
            <div className="text-sm text-gray-600">正在检查登录状态...</div>
          </>
        )}
        {authStatus === 'logging_in' && (
          <>
            <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <div className="text-sm text-gray-700 mb-1">请在弹出的浏览器窗口中扫码登录</div>
            <div className="text-xs text-gray-500">登录成功后窗口会自动关闭</div>
          </>
        )}
        {authStatus === 'logged_in' && (
          <>
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-green-500" />
            </div>
            <div className="text-sm text-green-700 font-medium mb-1">已登录</div>
            {profile?.userId && (
              <div className="text-xs text-gray-500 mb-4">用户ID: {profile.userId}</div>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </>
        )}
        {(authStatus === 'logged_out' || authStatus === 'error') && (
          <>
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-7 h-7 text-gray-400" />
            </div>
            <div className="text-sm text-gray-600 mb-4">未登录，点击下方按钮开始登录</div>
            <button
              onClick={handleLogin}
              className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              开始登录
            </button>
          </>
        )}
      </div>

      {authError && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
          <div className="text-sm text-red-700">{authError}</div>
        </div>
      )}

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-blue-900 font-medium mb-2">
          <Info className="w-4 h-4" />
          使用说明
        </div>
        <div className="text-xs text-blue-700 space-y-1 ml-6">
          <p>1. 点击"开始登录"后会打开浏览器窗口</p>
          <p>2. 使用小红书 APP 扫描二维码完成登录</p>
          <p>3. 登录成功后窗口会自动关闭</p>
        </div>
      </div>
    </div>
  );
}
