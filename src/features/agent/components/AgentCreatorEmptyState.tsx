import { ArrowLeft, Paperclip, Send, X } from 'lucide-react';
import type { ContentPackage } from '@/features/material-library/types';
import { ConversationHistory } from './ConversationHistory';
import { MaterialGallery } from './MaterialGallery';
import type { ImageGenProvider } from './AgentCreatorConfig';

interface AgentCreatorEmptyStateProps {
  onClose?: () => void;
  backLabel?: string;
  themeId: string;
  conversationId: number | null;
  loadConversation: (id: number) => void;
  startNewConversation: () => void;
  requirement: string;
  setRequirement: (value: string) => void;
  handleSubmit: () => void;
  isStreaming: boolean;
  imageGenProvider: ImageGenProvider;
  setImageGenProvider: (provider: ImageGenProvider) => void;
  autoConfirm: boolean;
  setAutoConfirm: (next: boolean) => void;
  packages: ContentPackage[];
  packagesLoading: boolean;
  setSelectedPackage: (pkg: ContentPackage | null) => void;
}

export function AgentCreatorEmptyState({
  onClose,
  backLabel,
  themeId,
  conversationId,
  loadConversation,
  startNewConversation,
  requirement,
  setRequirement,
  handleSubmit,
  isStreaming,
  imageGenProvider,
  setImageGenProvider,
  autoConfirm,
  setAutoConfirm,
  packages,
  packagesLoading,
  setSelectedPackage,
}: AgentCreatorEmptyStateProps) {
  return (
    <div className="flex-1 overflow-y-auto relative">
      {/* 右上角悬浮按钮组 */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {onClose && backLabel ? (
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition-colors shadow-sm text-xs text-gray-700"
            title={backLabel}
          >
            <ArrowLeft className="w-4 h-4 mr-1 text-gray-600" />
            {backLabel}
          </button>
        ) : onClose ? (
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition-colors shadow-sm"
            title="返回"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        ) : null}
        <ConversationHistory
          themeId={themeId}
          currentConversationId={conversationId}
          onSelect={loadConversation}
          onNewConversation={startNewConversation}
          compact
        />
      </div>

      {/* 上半部分：标题 + 输入框 */}
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">
            开启你的 <span className="text-blue-500">AI 创作</span> 之旅
          </h1>
          <p className="text-sm text-gray-400">
            AI 多专家协作，智能创作小红书内容
          </p>
        </div>

        {/* 输入框区域 */}
        <div className="w-full max-w-3xl mx-auto">
          {/* 主输入框 - 增强设计感 */}
          <div className="relative group">
            {/* 装饰性渐变背景 */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-[1.25rem] opacity-0 group-hover:opacity-100 blur transition duration-300" />

            {/* 输入框本体 */}
            <div className="relative flex items-center gap-3 rounded-[1.25rem] border-2 border-gray-200 bg-white px-5 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 hover:shadow-[0_8px_40px_rgb(0,0,0,0.12)] hover:border-gray-300">
              <button
                type="button"
                className="group/clip w-11 h-11 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-all duration-200"
              >
                <Paperclip className="w-5 h-5 group-hover/clip:rotate-12 transition-transform" />
              </button>

              <input
                type="text"
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="一句话描述目标（例：给我10条爆款选题）"
                className="flex-1 text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none"
                disabled={isStreaming}
              />

              <button
                onClick={handleSubmit}
                disabled={isStreaming || !requirement.trim()}
                className="group/send w-11 h-11 rounded-xl bg-gradient-to-r from-gray-800 to-gray-900 text-white flex items-center justify-center hover:from-gray-900 hover:to-black disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
              >
                <Send className="w-5 h-5 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* 模式切换和选项 - 极简高级设计 */}
          <div className="flex items-center justify-center gap-4 mt-6">
            {/* 生图模型选择 */}
            <div className="inline-flex items-center gap-2">
              <span className="text-[12px] text-gray-500">生图模型</span>
              <select
                value={imageGenProvider}
                onChange={(e) => setImageGenProvider(e.target.value as ImageGenProvider)}
                className="px-3 py-2 text-[13px] border border-gray-200 rounded-[0.625rem] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="jimeng">即梦 4.0</option>
                <option value="jimeng-45">即梦 4.5</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>

            {/* 分隔线 */}
            <div className="w-px h-6 bg-gray-200/60" />

            {/* 自动继续 - iOS Toggle 风格 */}
            <button
              onClick={() => setAutoConfirm(!autoConfirm)}
              className="group flex items-center gap-2.5 px-4 py-2.5 rounded-[0.75rem] hover:bg-gray-50/80 transition-all duration-200"
            >
              <div
                className={`relative w-9 h-5 rounded-full transition-all duration-300 ${
                  autoConfirm
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-inner'
                    : 'bg-gray-200'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${
                    autoConfirm ? 'left-[1.125rem]' : 'left-0.5'
                  }`}
                />
              </div>
              <span className={`text-[13px] font-medium transition-colors ${
                autoConfirm ? 'text-gray-700' : 'text-gray-500'
              }`}>
                自动继续
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 底部素材库预览 */}
      <MaterialGallery
        packages={packages}
        loading={packagesLoading}
        onSelect={setSelectedPackage}
      />
    </div>
  );
}
