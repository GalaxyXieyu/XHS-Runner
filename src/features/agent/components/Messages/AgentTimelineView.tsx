import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Activity } from 'lucide-react';
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
        return <div className="text-[11px] text-slate-500">已完成</div>;
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
      return <div className="text-[11px] text-slate-500">已完成</div>;
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

  const { currentStage, historyStages, finalContent, nextDecisionLabel } = timeline;
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
        <div className="rounded-xl bg-white shadow-sm shadow-slate-200/50 overflow-hidden">
          {/* Header */}
          <button
            type="button"
            onClick={() => setTraceExpandedOverride(!traceExpanded)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">执行轨迹</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-normal">
                {completedCount}/{steps.length}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {/* 折叠态：活动步骤 chip */}
              {!traceExpanded && activeLabel && (
                <span className="flex items-center gap-1.5 text-[11px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  {activeLabel}
                </span>
              )}
              {/* 总耗时 */}
              {totalDurationMs > 0 && (
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {formatTotalDuration(totalDurationMs)}
                </span>
              )}
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-slate-400 transition-transform duration-200',
                traceExpanded && 'rotate-180'
              )} />
            </span>
          </button>

          {/* 进度条 */}
          <div className="h-[2px] bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Steps */}
          <div className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            traceExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}>
            <div className="overflow-hidden">
              <div className="px-3.5 py-2.5">
                <div className="relative">
                  {steps.map((step, index) => {
                    const isLast = index === steps.length - 1;
                    const isWorking = step.status === 'working';
                    const expanded = isGroupExpanded(step.id, isWorking);
                    const hasCollapsibleContent = step.items.some((item) => {
                      if (item.kind === 'content') return true;
                      if (item.kind === 'tool' && ((item.payload as any)?.events?.length || 0) > 0) return true;
                      if (item.kind === 'result') return true;
                      if (item.kind === 'image_plan') return true;
                      if (item.kind === 'status') return true;
                      return false;
                    });

                    return (
                      <div key={step.id} className="relative flex items-start group/step">
                        {/* 内容区 */}
                        <div className={cn(
                          'flex-1 min-w-0 pb-3 rounded-lg transition-colors duration-200',
                          isWorking && 'bg-purple-50/60 px-2.5 py-1.5',
                        )}>
                          {/* 标题行 */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                              <span className={cn(
                                'text-xs font-medium',
                                isWorking ? 'text-purple-700' : 'text-slate-700'
                              )}>
                                {step.label}
                              </span>
                              <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium',
                                isWorking ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'
                              )}>
                                {isWorking ? '运行中' : '已完成'}
                              </span>
                              {/* 耗时 badge */}
                              {!isWorking && step.durationMs != null && step.durationMs > 0 && (
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  {formatDuration(step.durationMs)}
                                </span>
                              )}
                              {/* 摘要 */}
                              {step.summary && !expanded && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                  {step.summary}
                                </span>
                              )}
                            </div>
                            {/* 折叠按钮 */}
                            {hasCollapsibleContent && (
                              <button
                                type="button"
                                onClick={() => toggleGroup(step.id)}
                                className="shrink-0 p-0.5 rounded-lg hover:bg-slate-50/70 transition-colors"
                                title={expanded ? '收起' : '展开'}
                              >
                                <ChevronRight className={cn(
                                  'w-3.5 h-3.5 text-slate-400 transition-transform duration-200',
                                  expanded && 'rotate-90'
                                )} />
                              </button>
                            )}
                          </div>
                          {/* 展开内容 (动画) */}
                          {hasCollapsibleContent && (
                            <div className={cn(
                              'grid transition-[grid-template-rows] duration-300 ease-out',
                              expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                            )}>
                              <div className="overflow-hidden">
                                <div className="mt-2">
                                  {renderStepContent(step)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Ghost row: 下一步预测 */}
                  {isStreaming && nextDecisionLabel && (
                    <div className="flex items-center opacity-40 pt-1">
                      <span className="text-[11px] text-slate-400">
                        下一步: {nextDecisionLabel}
                      </span>
                    </div>
                  )}
                </div>
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
