import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, LogIn, RefreshCw, AlertCircle, Smartphone, X } from 'lucide-react';
import type { AuthStatus } from '@/hooks/useAuthStatus';

interface LoginRequiredDialogProps {
  open: boolean;
  status: AuthStatus;
  error: string | null;
  qrCodeUrl: string | null;
  onLogin: () => void;
  onRefreshQRCode?: () => void;
  onCancel?: () => void;
}

export function LoginRequiredDialog({
  open,
  status,
  error,
  qrCodeUrl,
  onLogin,
  onRefreshQRCode,
  onCancel,
}: LoginRequiredDialogProps) {
  const isLoggingIn = status === 'logging_in';
  const isLoadingQRCode = isLoggingIn && !qrCodeUrl;
  const hasQRCode = isLoggingIn && qrCodeUrl;

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[10000] w-full max-w-md translate-x-[-50%] translate-y-[-50%] bg-white rounded-lg border p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-2 text-center sm:text-left mb-4">
            <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold">
              {isLoggingIn ? (
                <Smartphone className="w-5 h-5 text-red-500" />
              ) : (
                <LogIn className="w-5 h-5 text-red-500" />
              )}
              小红书账号登录
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-gray-500">
              {hasQRCode
                ? '请使用小红书 App 扫描下方二维码'
                : isLoadingQRCode
                ? '正在获取登录二维码...'
                : '需要登录小红书账号才能使用完整功能'}
            </DialogPrimitive.Description>
          </div>

          <div className="space-y-4 py-4">
            {isLoadingQRCode ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-3" />
                <span className="text-sm text-gray-500">正在获取二维码...</span>
              </div>
            ) : hasQRCode ? (
              <div className="flex flex-col items-center">
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
                    打开小红书 App 扫一扫
                  </div>
                  <p className="text-xs text-gray-400">扫码后自动登录，无需其他操作</p>
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

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {hasQRCode && onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                取消
              </button>
            )}
            {!hasQRCode && (
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
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
