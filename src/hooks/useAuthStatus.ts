import { useState, useCallback, useEffect, useRef } from 'react';

export type AuthStatus = 'checking' | 'logged_in' | 'logged_out' | 'logging_in' | 'error';

interface Profile {
  userId?: string;
  nickname?: string;
}

interface AuthState {
  status: AuthStatus;
  isLoggedIn: boolean;
  isChecking: boolean;
  isLoggingIn: boolean;
  profile: Profile | null;
  error: string | null;
  qrCodeUrl: string | null;
}

const CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟
const POLL_INTERVAL = 2000; // 2秒轮询一次登录状态

export function useAuthStatus() {
  const [state, setState] = useState<AuthState>({
    status: 'checking',
    isLoggedIn: false,
    isChecking: true,
    isLoggingIn: false,
    profile: null,
    error: null,
    qrCodeUrl: null,
  });

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checkTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(async (silent = false) => {
    if (!silent) {
      setState(prev => ({ ...prev, status: 'checking', isChecking: true, error: null }));
    }

    try {
      let result: any;
      if (window.auth?.checkStatus) {
        result = await window.auth.checkStatus();
      } else {
        const res = await fetch('/api/auth/status');
        result = await res.json();
      }

      const isLoggedIn = result.loggedIn === true;
      setState(prev => ({
        ...prev,
        status: isLoggedIn ? 'logged_in' : 'logged_out',
        isLoggedIn,
        isChecking: false,
        isLoggingIn: false,
        profile: result.profile || null,
        error: null,
        qrCodeUrl: null,
      }));
      return isLoggedIn;
    } catch (e) {
      if (!silent) {
        setState(prev => ({
          ...prev,
          status: 'error',
          isChecking: false,
          error: e instanceof Error ? e.message : '检测登录状态失败',
        }));
      }
      return false;
    }
  }, []);

  // 获取二维码并开始轮询
  const startQRCodeLogin = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'logging_in', isLoggingIn: true, error: null, qrCodeUrl: null }));

    try {
      // 获取二维码
      let qrResult: any;
      if (window.auth?.getQRCode) {
        qrResult = await window.auth.getQRCode();
      } else {
        const res = await fetch('/api/auth/qrcode');
        qrResult = await res.json();
      }

      if (!qrResult.success) {
        if (qrResult.message === 'already_logged_in') {
          // 已经登录了
          await checkStatus();
          return true;
        }
        throw new Error(qrResult.message || '获取二维码失败');
      }

      setState(prev => ({ ...prev, qrCodeUrl: qrResult.qrCodeUrl }));

      // 开始轮询登录状态
      stopPolling();
      pollTimerRef.current = setInterval(async () => {
        try {
          let pollResult: any;
          if (window.auth?.pollLoginStatus) {
            pollResult = await window.auth.pollLoginStatus();
          } else {
            const res = await fetch('/api/auth/poll');
            pollResult = await res.json();
          }

          if (pollResult.loggedIn) {
            stopPolling();
            setState({
              status: 'logged_in',
              isLoggedIn: true,
              isChecking: false,
              isLoggingIn: false,
              profile: pollResult.profile || null,
              error: null,
              qrCodeUrl: null,
            });
          } else if (pollResult.message === 'no_active_session') {
            // 会话已过期，需要重新获取二维码
            stopPolling();
            setState(prev => ({
              ...prev,
              status: 'logged_out',
              isLoggingIn: false,
              error: '二维码已过期，请重新获取',
              qrCodeUrl: null,
            }));
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, POLL_INTERVAL);

      return true;
    } catch (e) {
      setState(prev => ({
        ...prev,
        status: 'logged_out',
        isLoggingIn: false,
        error: e instanceof Error ? e.message : '登录失败',
        qrCodeUrl: null,
      }));
      return false;
    }
  }, [checkStatus, stopPolling]);

  // 传统登录方式（弹出浏览器）
  const login = useCallback(async (options?: { timeout?: number; useQRCode?: boolean }) => {
    // 默认使用二维码登录
    if (options?.useQRCode !== false) {
      return startQRCodeLogin();
    }

    // 传统方式
    setState(prev => ({ ...prev, status: 'logging_in', isLoggingIn: true, error: null }));

    try {
      let result: any;
      if (window.auth?.login) {
        result = await window.auth.login(options);
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options || {}),
        });
        result = await res.json();
      }

      if (result.success) {
        setState({
          status: 'logged_in',
          isLoggedIn: true,
          isChecking: false,
          isLoggingIn: false,
          profile: result.profile || null,
          error: null,
          qrCodeUrl: null,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          status: 'logged_out',
          isLoggingIn: false,
          error: result.message || '登录失败',
        }));
        return false;
      }
    } catch (e) {
      setState(prev => ({
        ...prev,
        status: 'error',
        isLoggingIn: false,
        error: e instanceof Error ? e.message : '登录失败',
      }));
      return false;
    }
  }, [startQRCodeLogin]);

  const logout = useCallback(async () => {
    stopPolling();
    try {
      if (window.auth?.logout) {
        await window.auth.logout();
      } else {
        await fetch('/api/auth/logout', { method: 'POST' });
      }
      setState({
        status: 'logged_out',
        isLoggedIn: false,
        isChecking: false,
        isLoggingIn: false,
        profile: null,
        error: null,
        qrCodeUrl: null,
      });
    } catch (e) {
      console.error('Logout failed:', e);
    }
  }, [stopPolling]);

  const cancelLogin = useCallback(async () => {
    stopPolling();
    try {
      if (window.auth?.cancelQRCodeSession) {
        await window.auth.cancelQRCodeSession();
      } else {
        await fetch('/api/auth/cancel', { method: 'POST' });
      }
    } catch {}
    setState(prev => ({
      ...prev,
      status: 'logged_out',
      isLoggingIn: false,
      qrCodeUrl: null,
    }));
  }, [stopPolling]);

  // 刷新二维码
  const refreshQRCode = useCallback(async () => {
    stopPolling();
    return startQRCodeLogin();
  }, [stopPolling, startQRCodeLogin]);

  // 应用启动时自动检测
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 5分钟定时检测
  useEffect(() => {
    checkTimerRef.current = setInterval(() => {
      // 只在已登录状态下静默检测
      if (state.isLoggedIn) {
        checkStatus(true);
      }
    }, CHECK_INTERVAL);

    return () => {
      if (checkTimerRef.current) {
        clearInterval(checkTimerRef.current);
      }
    };
  }, [checkStatus, state.isLoggedIn]);

  // 清理
  useEffect(() => {
    return () => {
      stopPolling();
      if (checkTimerRef.current) {
        clearInterval(checkTimerRef.current);
      }
    };
  }, [stopPolling]);

  return {
    ...state,
    checkStatus,
    login,
    logout,
    cancelLogin,
    refreshQRCode,
  };
}
