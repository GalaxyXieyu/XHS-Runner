import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, LogIn, RefreshCw, AlertCircle, Smartphone, X, Cookie, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { AuthStatus } from '@/hooks/useAuthStatus';
import { useState } from 'react';

interface LoginRequiredDialogProps {
  open: boolean;
  status: AuthStatus;
  error: string | null;
  qrCodeUrl: string | null;
  verificationRound?: number;
  onLogin: () => void;
  onRefreshQRCode?: () => void;
  onCancel?: () => void;
  onImportCookies?: (cookies: string) => Promise<boolean>;
}

type LoginMethod = 'qrcode' | 'cookie';

export function LoginRequiredDialog({
  open,
  status,
  error,
  qrCodeUrl,
  verificationRound = 1,
  onLogin,
  onRefreshQRCode,
  onCancel,
  onImportCookies,
}: LoginRequiredDialogProps) {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('qrcode');
  const [cookieInput, setCookieInput] = useState('');
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const isLoggingIn = status === 'logging_in';
  const isLoadingQRCode = isLoggingIn && !qrCodeUrl && loginMethod === 'qrcode';
  const hasQRCode = isLoggingIn && qrCodeUrl && loginMethod === 'qrcode';

  const handleImportCookies = async () => {
    if (!cookieInput.trim() || !onImportCookies) return;
    setIsImporting(true);
    try {
      const success = await onImportCookies(cookieInput.trim());
      if (success) {
        setCookieInput('');
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[10000] w-full max-w-md translate-x-[-50%] translate-y-[-50%] bg-white rounded-lg border p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-2 text-center sm:text-left mb-4">
            <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold">
              {loginMethod === 'qrcode' ? (
                <Smartphone className="w-5 h-5 text-red-500" />
              ) : (
                <Cookie className="w-5 h-5 text-red-500" />
              )}
              小红书账号登录
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-gray-500">
              {loginMethod === 'qrcode'
                ? hasQRCode
                  ? '请使用小红书 App 扫描下方二维码'
                  : isLoadingQRCode
                  ? '正在获取登录二维码...'
                  : '需要登录小红书账号才能使用完整功能'
                : '粘贴从浏览器复制的 Cookie 字符串'}
            </DialogPrimitive.Description>
          </div>

          {/* 登录方式切换 */}
          <div className="flex gap-2 mb-4 border-b">
            <button
              onClick={() => setLoginMethod('qrcode')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                loginMethod === 'qrcode'
                  ? 'border-red-500 text-red-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Smartphone className="w-4 h-4 inline mr-1" />
              扫码登录
            </button>
            <button
              onClick={() => setLoginMethod('cookie')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                loginMethod === 'cookie'
                  ? 'border-red-500 text-red-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Cookie className="w-4 h-4 inline mr-1" />
              Cookie 导入
            </button>
          </div>

          <div className="space-y-4 py-2">
            {loginMethod === 'qrcode' ? (
              <>
                {isLoadingQRCode ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-3" />
                    <span className="text-sm text-gray-500">正在获取二维码...</span>
                  </div>
                ) : hasQRCode ? (
                  <div className="flex flex-col items-center">
                    {verificationRound > 1 && (
                      <div className="mb-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                        <span className="text-xs font-medium text-amber-700">
                          第 {verificationRound} 轮验证
                        </span>
                      </div>
                    )}
                    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                      <img
                        src={qrCodeUrl}
                        alt="登录二维码"
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                    <div className="mt-4 text-center space-y-2">
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                        <Smartphone className="w-4 h-4" />
                        {verificationRound > 1
                          ? '请继续扫描新的二维码完成验证'
                          : '打开小红书 App 扫一扫'}
                      </div>
                      <p className="text-xs text-gray-400">
                        {verificationRound > 1
                          ? '小红书需要多次验证以确保账号安全'
                          : '扫码后自动登录，无需其他操作'}
                      </p>
                    </div>
                    {onRefreshQRCode && (
                      <button
                        onClick={onRefreshQRCode}
                        className="mt-4 flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        刷新二维码
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs flex-shrink-0">1</span>
                      <span>点击下方按钮获取登录二维码</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs flex-shrink-0">2</span>
                      <span>使用小红书 App 扫描二维码</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs flex-shrink-0">3</span>
                      <span>扫码成功后自动完成登录</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {/* Cookie 输入框 */}
                <div>
                  <textarea
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    placeholder="粘贴 Cookie 字符串，格式如：a1=xxx; web_session=xxx; ..."
                    className="w-full h-24 p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                {/* Cookie 获取说明 */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <button
                    onClick={() => setShowCookieHelp(!showCookieHelp)}
                    className="flex items-center justify-between w-full text-sm font-medium text-gray-700"
                  >
                    <span>如何获取 Cookie？</span>
                    {showCookieHelp ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {showCookieHelp && (
                    <div className="mt-3 space-y-2 text-xs text-gray-600">
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] flex-shrink-0">1</span>
                        <span>在浏览器中打开 <a href="https://www.xiaohongshu.com" target="_blank" rel="noopener noreferrer" className="text-red-500 underline">小红书网页版</a> 并登录</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] flex-shrink-0">2</span>
                        <span>按 F12 打开开发者工具，切换到 Network 标签</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] flex-shrink-0">3</span>
                        <span>刷新页面，点击任意一个请求</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] flex-shrink-0">4</span>
                        <span>在 Headers 中找到 <code className="bg-gray-200 px-1 rounded">Cookie</code> 字段，复制整个值</span>
                      </div>
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-700">
                        <strong>提示：</strong>确保复制的 Cookie 包含 <code className="bg-amber-100 px-1 rounded">web_session</code> 字段
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            {(hasQRCode || loginMethod === 'cookie') && onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                取消
              </button>
            )}
            {loginMethod === 'qrcode' && !hasQRCode && (
              <button
                onClick={onLogin}
                disabled={isLoadingQRCode}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoadingQRCode ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    获取中...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    获取二维码
                  </>
                )}
              </button>
            )}
            {loginMethod === 'cookie' && (
              <button
                onClick={handleImportCookies}
                disabled={!cookieInput.trim() || isImporting}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Cookie className="w-4 h-4" />
                    导入 Cookie
                  </>
                )}
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
