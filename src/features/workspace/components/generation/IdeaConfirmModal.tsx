import { AlertCircle, Check, Loader, X } from 'lucide-react';

type IdeaConfig = {
  model: 'nanobanana' | 'jimeng';
  styleKeyOption: 'cozy' | 'minimal' | 'illustration' | 'ink' | 'anime' | '3d' | 'cyberpunk' | 'photo' | 'custom';
  customStyleKey: string;
};

interface IdeaConfirmModalProps {
  show: boolean;
  prompts: string[];
  ideaConfig: IdeaConfig;
  confirming: boolean;
  error: string;
  resolveStyleKey: () => string;
  onClose: () => void;
  onConfirm: () => void;
}

export function IdeaConfirmModal({
  show,
  prompts,
  ideaConfig,
  confirming,
  error,
  resolveStyleKey,
  onClose,
  onConfirm,
}: IdeaConfirmModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-900">确认生成</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">Prompts</div>
              <div className="font-medium">{prompts.length} 条</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">模型</div>
              <div className="font-medium">{ideaConfig.model}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">风格</div>
              <div className="font-medium">{resolveStyleKey() || 'cozy'}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">即将入队的 prompts（可返回继续编辑）</div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-auto divide-y divide-gray-100">
                {prompts.map((p, idx) => (
                  <div key={idx} className="p-3 text-sm text-gray-800 whitespace-pre-wrap break-words">
                    <span className="text-xs text-gray-500 mr-2">#{idx + 1}</span>
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={confirming}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-60"
            >
              返回编辑
            </button>
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="px-4 py-2 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {confirming ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              确认入队
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
