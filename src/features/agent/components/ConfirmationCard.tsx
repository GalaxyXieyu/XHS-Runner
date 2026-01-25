import { Check, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useRef } from 'react';

interface ConfirmationCardProps {
  type: 'content' | 'image_plans';
  data: {
    title?: string;
    content?: string;
    body?: string; // 兼容字段
    tags?: string[];
    plans?: Array<{ prompt: string; aspectRatio: string }>;
  };
  threadId: string;
  onConfirm: (threadId: string, approved: boolean, feedback?: string) => void;
  isConfirming?: boolean;
}

export function ConfirmationCard({ type, data, threadId, onConfirm, isConfirming }: ConfirmationCardProps) {
  const isContent = type === 'content';
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const plans = data.plans || [];
  const totalPlans = plans.length;

  const scrollToIndex = (index: number) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = container.offsetWidth;
      container.scrollTo({
        left: index * cardWidth,
        behavior: 'smooth'
      });
      setCurrentIndex(index);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      scrollToIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalPlans - 1) {
      scrollToIndex(currentIndex + 1);
    }
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 rounded-xl border border-emerald-200 overflow-hidden shadow-sm">
      {/* 头部 */}
      <div className="px-4 py-3 bg-white/50 border-b border-emerald-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-medium text-emerald-900">
            {isContent ? '内容创作完成，请确认' : '图片规划完成，请确认'}
          </span>
        </div>
      </div>

      {/* 内容预览 */}
      <div className="p-4 space-y-3">
        {isContent ? (
          <>
            {/* 标题 */}
            {data.title && (
              <div>
                <div className="text-xs text-emerald-600 mb-1">标题</div>
                <div className="text-sm font-semibold text-gray-900">{data.title}</div>
              </div>
            )}

            {/* 正文预览 */}
            {(data.content || data.body) && (
              <div>
                <div className="text-xs text-emerald-600 mb-1">正文预览</div>
                <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto bg-white/50 rounded-lg p-2">
                  {data.content || data.body}
                </div>
              </div>
            )}

            {/* 标签 */}
            {data.tags && data.tags.length > 0 && (
              <div>
                <div className="text-xs text-emerald-600 mb-1">标签</div>
                <div className="flex flex-wrap gap-1">
                  {data.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* 图片规划 - 卡片轮播 */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-emerald-600">图片规划</div>
              <div className="text-xs text-gray-400">{currentIndex + 1} / {totalPlans}</div>
            </div>

            {/* 轮播容器 */}
            <div className="relative">
              {/* 卡片滚动区域 */}
              <div
                ref={scrollContainerRef}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {plans.map((plan, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-full snap-center"
                  >
                    <div className="bg-gradient-to-br from-white to-emerald-50/30 rounded-xl p-4 border-2 border-emerald-200 shadow-sm">
                      {/* 卡片头部 */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <span className="text-sm font-bold text-emerald-700">{i + 1}</span>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-700">图片 {i + 1}</div>
                            <div className="text-xs text-gray-400">{plan.aspectRatio}</div>
                          </div>
                        </div>
                        <div className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">
                          {plan.role || '主图'}
                        </div>
                      </div>

                      {/* Prompt 内容 */}
                      <div className="bg-white/80 rounded-lg p-3 border border-emerald-100">
                        <div className="text-xs text-emerald-600 mb-1.5 font-medium">生成提示词</div>
                        <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {plan.prompt}
                        </div>
                      </div>

                      {/* 额外信息（如果有） */}
                      {plan.description && (
                        <div className="mt-3 pt-3 border-t border-emerald-100">
                          <div className="text-xs text-gray-500">{plan.description}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 左右导航按钮 */}
              {totalPlans > 1 && (
                <>
                  <button
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-8 h-8 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={currentIndex === totalPlans - 1}
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-8 h-8 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                </>
              )}
            </div>

            {/* 指示器 */}
            {totalPlans > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-2">
                {plans.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentIndex
                        ? 'w-6 bg-emerald-600'
                        : 'w-1.5 bg-emerald-200 hover:bg-emerald-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="px-4 py-3 bg-white/50 border-t border-emerald-100 flex items-center gap-2">
        <button
          onClick={() => onConfirm(threadId, true)}
          disabled={isConfirming}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-all"
        >
          {isConfirming ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              确认继续
            </>
          )}
        </button>

        <button
          onClick={() => onConfirm(threadId, false, '需要重新生成')}
          disabled={isConfirming}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 text-gray-700 disabled:text-gray-400 text-sm font-medium rounded-lg border border-gray-200 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          重新生成
        </button>
      </div>
    </div>
  );
}
