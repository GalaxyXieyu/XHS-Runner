import React, { useMemo, useState } from 'react';
import { ChevronDown, Activity } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import type { ImageTask } from '../../types';
import { ContentCard } from '../ContentCard';
import { CollapsibleToolCard } from '../ToolEventList';
import { ImagePlanCard, type ParsedImagePlan } from '../ImagePlanCard';
import { BriefResultCard, LayoutSpecCard, AlignmentMapCard, QualityScoreCard } from '../AgentStatusCards';
import { agentProgressMap } from '../AgentCreatorConfig';
import type { AgentGroup, AgentTimeline, StageNode, StreamItem } from '../../utils/buildAgentTimeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AgentTimelineViewProps {
  timeline: AgentTimeline;
  isStreaming?: boolean;
  onImageClick?: (imageUrl: string) => void;
}

interface FlatStep {
  id: string;
  agentKey: string;
  label: string;
  status: 'working' | 'completed';
  summary: string;
  items: StreamItem[];
  stageId: string;
  groupId: string;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds % 60);
  return `${minutes}m${remainSeconds}s`;
}

function formatTotalDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return remainSeconds > 0 ? `${minutes}分${remainSeconds}秒` : `${minutes}分`;
}

function getStepSummary(group: AgentGroup): string {
  const firstItem = group.items[0];
  if (!firstItem) return '';

  switch (firstItem.kind) {
    case 'result': {
      const payload = firstItem.payload as { state: { result?: unknown; agent?: string } };
      const state = payload?.state;
      const agent = state?.agent || '';
      const result = state?.result;
      if (agent === 'brief_compiler_agent' && result) return 'Brief';
      if (typeof result === 'string') {
        return result.length > 40 ? `${result.slice(0, 40)}...` : result;
      }
      return '完成';
    }
    case 'status': {
      const phase = (firstItem.payload as { state?: { phase?: string } })?.state?.phase;
      return phase ? `进行中 · ${phase}` : '进行中';
    }
    case 'tool': {
      const eventCount = ((firstItem.payload as { events?: unknown[] })?.events?.length) || 0;
      return eventCount > 0 ? `${eventCount} 个工具调用` : '工具调用';
    }
    case 'content':
      return '创作输出';
    case 'image_plan': {
      const plans = (firstItem.payload as { imagePlan?: { plans?: unknown[] } })?.imagePlan?.plans;
      const count = Array.isArray(plans) ? plans.length : 0;
      return count > 0 ? `规划 ${count} 张图片` : '图片规划';
    }
    default:
      return firstItem.title || '';
  }
}

function flattenTimeline(stages: StageNode[]): FlatStep[] {
  const steps: FlatStep[] = [];
  stages.forEach((stage) => {
    stage.groups.forEach((group) => {
      steps.push({
        id: group.id,
        agentKey: group.agentKey,
        label: group.label,
        status: group.status,
        summary: getStepSummary(group),
        items: group.items,
        stageId: stage.id,
        groupId: group.id,
        durationMs: group.durationMs,
      });
    });
  });
  return steps;
}

function computeProgressPercent(steps: FlatStep[]): number {
  const workingStep = steps.find((s) => s.status === 'working');
  if (workingStep) {
    return agentProgressMap[workingStep.agentKey] || 50;
  }
  // 全部完成
  if (steps.length > 0 && steps.every((s) => s.status === 'completed')) {
    return 100;
  }
  return 0;
}

function computeTotalDuration(steps: FlatStep[]): number {
  let total = 0;
  for (const step of steps) {
    if (step.durationMs && step.durationMs > 0) {
      total += step.durationMs;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// GenericResultCard - 通用结果卡片（未匹配专用卡片时的 fallback）
// ---------------------------------------------------------------------------
function GenericResultCard({ result, agentKey }: { result: any; agentKey: string }) {
  // 字符串结果
  if (typeof result === 'string') {
    if (!result.trim()) return null;
    return (
      <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
        {result.length > 300 ? `${result.slice(0, 300)}...` : result}
      </div>
    );
  }

  // 对象结果：尝试提取 title/body/tags 等常见字段
  if (typeof result === 'object' && result !== null) {
    const title = result.title || result.name || result.summary || '';
    const body = result.body || result.content || result.description || result.text || '';
    const tags: string[] = Array.isArray(result.tags) ? result.tags : [];

    // 如果有可识别的内容字段
    if (title || body) {
      return (
        <div className="space-y-1">
          {title && <div className="text-xs font-medium text-slate-700">{String(title).slice(0, 100)}</div>}
          {body && (
            <div className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap">
              {String(body).length > 200 ? `${String(body).slice(0, 200)}...` : String(body)}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {tags.slice(0, 8).map((tag, i) => (
                <span key={i} className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                  #{String(tag).replace(/^#/, '')}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    // 数组结果（如图片列表、规划项等）
    if (Array.isArray(result) && result.length > 0) {
      return (
        <div className="text-[11px] text-slate-500">
          共 {result.length} 项结果
        </div>
      );
    }

    // 其他对象：显示 key 概览
    const keys = Object.keys(result).filter(k => result[k] != null);
    if (keys.length > 0 && keys.length <= 10) {
      return (
        <div className="text-[11px] text-slate-500">
          输出: {keys.join(', ')}
        </div>
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// renderStreamItem - 使用专用卡片组件渲染各步骤内容
// ---------------------------------------------------------------------------
function renderStreamItem({
  item,
  expanded,
  onToggle,
  onImageClick,
}: {
  item: StreamItem;
  expanded: boolean;
  onToggle: () => void;
  onImageClick?: (imageUrl: string) => void;
}) {
  switch (item.kind) {
    case 'tool': {
      const payload = item.payload as {
        events: any[];
        researchContent?: string;
        isLoading?: boolean;
        streamPhase?: string;
      };
      return (
        <CollapsibleToolCard
          title={item.title || '研究过程'}
          events={payload.events || []}
          isLoading={payload.isLoading}
          expanded={expanded}
          onToggle={onToggle}
          phase={payload.streamPhase}
          researchContent={payload.researchContent}
          inline
        />
      );
    }
    case 'result': {
      const payload = item.payload as { state: any };
      const agent = payload.state?.agent || '';
      const result = payload.state?.result;
      if (!result) {
        return null; // 无结果数据时不渲染展开内容
      }
      if (agent === 'brief_compiler_agent') {
        return <BriefResultCard brief={result} expanded={expanded} onToggle={onToggle} inline />;
      }
      if (agent === 'layout_planner_agent') {
        return <LayoutSpecCard layoutSpec={result} expanded={expanded} onToggle={onToggle} inline />;
      }
      if (agent === 'image_planner_agent' || agent === 'reference_intelligence_agent') {
        return <AlignmentMapCard alignment={result} expanded={expanded} onToggle={onToggle} inline />;
      }
      if (agent === 'review_agent') {
        return <QualityScoreCard scores={result} expanded={expanded} onToggle={onToggle} inline />;
      }
      // 通用结果展示：尝试从结果中提取有用信息
      return <GenericResultCard result={result} agentKey={agent} />;
    }
    case 'status': {
      const payload = item.payload as { state: any };
      const phase = payload.state?.phase || '';
      return phase ? (
        <div className="text-[11px] text-purple-600">{phase}</div>
      ) : null;
    }
    case 'image_plan': {
      const payload = item.payload as { imagePlan: ParsedImagePlan | null };
      if (!payload.imagePlan) return null;
      return <ImagePlanCard imagePlan={payload.imagePlan} />;
    }
    case 'content': {
      const payload = item.payload as {
        content: any;
        imageTasks?: ImageTask[];
        isStreaming?: boolean;
      };
      return (
        <ContentCard
          content={payload.content}
          imageTasks={payload.imageTasks || []}
          isStreaming={payload.isStreaming}
          onImageClick={onImageClick}
        />
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function AgentTimelineView({ timeline, isStreaming = false, onImageClick }: AgentTimelineViewProps) {
  const [traceExpandedOverride, setTraceExpandedOverride] = useState<boolean | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const traceExpanded = traceExpandedOverride ?? isStreaming;

  const { currentStage, historyStages, finalContent, nextDecisionLabel, isThinking } = timeline;
  const allStages = currentStage
    ? [...historyStages, currentStage]
    : historyStages;

  const steps = useMemo(() => flattenTimeline(allStages), [allStages]);
  const progressPercent = useMemo(() => computeProgressPercent(steps), [steps]);
  const totalDurationMs = useMemo(() => computeTotalDuration(steps), [steps]);

  const isGroupExpanded = (id: string, fallback: boolean) => {
    const value = expandedGroupIds[id];
    return typeof value === 'boolean' ? value : fallback;
  };

  const toggleGroup = (id: string) => {
    setExpandedGroupIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderStepContent = (step: FlatStep) => (
    <div className="space-y-2">
      {step.items.map((item) => {
        return (
          <div key={item.id} className="space-y-1">
            {renderStreamItem({
              item,
              expanded: true,
              onToggle: () => {},
              onImageClick,
            })}
          </div>
        );
      })}
    </div>
  );

  const activeStep = steps.find((s) => s.status === 'working');
  const activeLabel = activeStep?.label || '';
  const completedCount = steps.filter((s) => s.status === 'completed').length;

  return (
    <div className="space-y-3 max-w-[80%]">
      {/* ====== 执行轨迹区域 ====== */}
      {steps.length > 0 && (
        <div className="py-1">
          {/* Header - 极简 */}
          <button
            type="button"
            onClick={() => setTraceExpandedOverride(!traceExpanded)}
            className="w-full flex items-center justify-between py-1.5 group/header"
          >
            <span className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-300" />
              <span className="text-xs font-semibold text-slate-600">执行轨迹</span>
              <span className="text-[10px] text-slate-400 tabular-nums">
                {completedCount}/{steps.length}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {!traceExpanded && activeLabel && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-purple-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  {activeLabel}
                </span>
              )}
              {totalDurationMs > 0 && (
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {formatTotalDuration(totalDurationMs)}
                </span>
              )}
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-slate-300 transition-transform duration-200 group-hover/header:text-slate-500',
                traceExpanded && 'rotate-180'
              )} />
            </span>
          </button>

          {/* 进度条 - 细线 */}
          <div className="h-px bg-slate-100 mb-1">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-purple-500 transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Steps - 时间线 */}
          <div className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            traceExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}>
            <div className="overflow-hidden">
              <div className="relative ml-2">
                {/* 纵轴线 */}
                <div className="absolute left-[3px] top-3 bottom-3 w-px bg-slate-200" />

                {steps.map((step, index) => {
                  const isLast = index === steps.length - 1;
                  const isWorking = step.status === 'working';
                  const expanded = isGroupExpanded(step.id, isWorking);
                  const hasCollapsibleContent = step.items.some((item) => {
                    if (item.kind === 'content') return true;
                    if (item.kind === 'tool' && ((item.payload as any)?.events?.length || 0) > 0) return true;
                    if (item.kind === 'result') {
                      const result = (item.payload as any)?.state?.result;
                      return result != null && result !== undefined;
                    }
                    if (item.kind === 'image_plan') return true;
                    if (item.kind === 'status') return true;
                    return false;
                  });

                  return (
                    <div key={step.id} className="relative flex items-start gap-3 group/step">
                      {/* 时间线圆点 */}
                      <div className="relative z-10 mt-[9px] shrink-0">
                        {isWorking ? (
                          <span className="block w-[7px] h-[7px] rounded-full bg-purple-500 ring-2 ring-purple-200 animate-pulse" />
                        ) : (
                          <span className="block w-[7px] h-[7px] rounded-full bg-emerald-500 ring-2 ring-white" />
                        )}
                      </div>

                      {/* 内容区 */}
                      <div className="flex-1 min-w-0 pb-4">
                        {/* 标题行 */}
                        <div
                          className={cn(
                            'flex items-center justify-between gap-2',
                            hasCollapsibleContent && 'cursor-pointer',
                          )}
                          onClick={hasCollapsibleContent ? () => toggleGroup(step.id) : undefined}
                        >
                          <div className="flex items-center gap-x-2 min-w-0 flex-1">
                            <span className={cn(
                              'text-xs font-medium whitespace-nowrap',
                              isWorking ? 'text-purple-700' : 'text-slate-700'
                            )}>
                              {step.label}
                            </span>
                            {isWorking ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium shrink-0">
                                <span className="w-1 h-1 rounded-full bg-purple-500 animate-pulse" />
                                运行中
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium shrink-0">
                                已完成
                              </span>
                            )}
                            {!isWorking && step.durationMs != null && step.durationMs > 0 && (
                              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                                {formatDuration(step.durationMs)}
                              </span>
                            )}
                            {step.summary && !expanded && (
                              <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                {step.summary}
                              </span>
                            )}
                          </div>
                          {hasCollapsibleContent && (
                            <ChevronDown className={cn(
                              'w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform duration-200',
                              expanded && 'rotate-180'
                            )} />
                          )}
                        </div>

                        {/* 展开内容 */}
                        {hasCollapsibleContent && (
                          <div className={cn(
                            'grid transition-[grid-template-rows] duration-300 ease-out',
                            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          )}>
                            <div className="overflow-hidden">
                              <div className="mt-2 ml-0.5">
                                {renderStepContent(step)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 思考中：supervisor 正在决策下一步 */}
                {isStreaming && isThinking && (
                  <div className="relative flex items-start gap-3">
                    <div className="relative z-10 mt-[9px] shrink-0">
                      <span className="block w-[7px] h-[7px] rounded-full bg-slate-300 ring-2 ring-white animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-slate-400">思考中</span>
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== 最终内容卡（仅 workflow_complete 时显示） ====== */}
      {finalContent && (
        <ContentCard
          content={finalContent.content}
          imageTasks={finalContent.imageTasks}
          isStreaming={finalContent.isStreaming}
          onImageClick={onImageClick}
        />
      )}
    </div>
  );
}
