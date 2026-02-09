import { cn } from '@/components/ui/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AgentEvent } from '../types';
import { getDisplayName } from './ToolEventList';

// Agent 状态类型
export interface AgentState {
  agent: string;
  status: 'working' | 'completed';
  startTime: number;
  endTime?: number;
  phase?: string;
  result?: any;
}

function findLatestEvent(
  allEvents: AgentEvent[],
  type: AgentEvent['type'],
  agent?: string,
): AgentEvent | null {
  for (let i = allEvents.length - 1; i >= 0; i -= 1) {
    const event = allEvents[i];
    if (event.type !== type) continue;
    if (agent && event.agent !== agent) continue;
    return event;
  }
  return null;
}

function normalizeLayoutSpec(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];

  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.layoutSpec)) return record.layoutSpec;
  if (Array.isArray(record.items)) return record.items;
  return [];
}

function extractAgentResultByAgent(agent: string, allEvents: AgentEvent[]): any {
  if (agent === 'brief_compiler_agent') {
    const briefEvent = findLatestEvent(allEvents, 'brief_ready', 'brief_compiler_agent')
      || findLatestEvent(allEvents, 'brief_ready');
    return briefEvent?.brief || null;
  }

  if (agent === 'layout_planner_agent') {
    const layoutEvent = findLatestEvent(allEvents, 'layout_spec_ready', 'layout_planner_agent')
      || findLatestEvent(allEvents, 'layout_spec_ready');
    const layoutSpec = normalizeLayoutSpec(layoutEvent?.layoutSpec);
    return {
      layoutSpec,
      count: layoutSpec.length,
    };
  }

  if (agent === 'image_planner_agent' || agent === 'reference_intelligence_agent') {
    const alignmentEvent = findLatestEvent(allEvents, 'alignment_map_ready', 'image_planner_agent')
      || findLatestEvent(allEvents, 'alignment_map_ready', agent)
      || findLatestEvent(allEvents, 'alignment_map_ready');

    const paragraphImageBindings = Array.isArray(alignmentEvent?.paragraphImageBindings)
      ? alignmentEvent.paragraphImageBindings
      : [];
    const bodyBlocks = Array.isArray(alignmentEvent?.bodyBlocks)
      ? alignmentEvent.bodyBlocks
      : [];

    return {
      paragraphImageBindings,
      bodyBlocks,
      bindingsCount: paragraphImageBindings.length,
      blocksCount: bodyBlocks.length,
    };
  }

  if (agent === 'review_agent') {
    const qualityEvent = findLatestEvent(allEvents, 'quality_score', 'review_agent')
      || findLatestEvent(allEvents, 'quality_score');
    return qualityEvent?.qualityScores || null;
  }

  return null;
}

/**
 * 从事件数组中提取每个 agent 的最新状态
 * 解决“开始和完成同时出现”以及“结果统计显示为 0”的问题
 */
export function getAgentStates(events: AgentEvent[]): Map<string, AgentState> {
  const states = new Map<string, AgentState>();

  for (const event of events) {
    if (!event.agent) continue;

    if (event.type === 'agent_start') {
      states.set(event.agent, {
        agent: event.agent,
        status: 'working',
        startTime: event.timestamp,
        phase: '',
      });
      continue;
    }

    if (event.type === 'agent_end') {
      const existing = states.get(event.agent);
      states.set(event.agent, {
        agent: event.agent,
        status: 'completed',
        startTime: existing?.startTime || event.timestamp,
        endTime: event.timestamp,
        result: extractAgentResultByAgent(event.agent, events),
      });
      continue;
    }

    if (event.type === 'progress') {
      const existing = states.get(event.agent);
      if (existing && existing.status === 'working') {
        existing.phase = event.content;
      }
    }
  }

  // 二次回填：避免结果事件先后顺序导致统计值异常
  for (const [agent, state] of states.entries()) {
    if (state.status !== 'completed') continue;

    const latestResult = extractAgentResultByAgent(agent, events);
    if (latestResult !== null && latestResult !== undefined) {
      state.result = latestResult;
      states.set(agent, state);
    }
  }

  return states;
}

// ============================================================================
// Supervisor 路由卡片
// ============================================================================

interface SupervisorRouteCardProps {
  event: AgentEvent;
}

export function SupervisorRouteCard({ event }: SupervisorRouteCardProps) {
  const nextAgent = event.decision || event.content;
  const reason = event.reason || '';
  const displayName = getDisplayName(nextAgent);

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-purple-700">主管决策</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-purple-600">
        <span>下一步</span>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium">{displayName}</span>
      </div>
      {reason && (
        <div className="mt-1 text-xs text-purple-500">
          {reason}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Agent 工作卡片（正在工作中）
// ============================================================================

interface AgentWorkingCardProps {
  state: AgentState;
}

export function AgentWorkingCard({ state }: AgentWorkingCardProps) {
  const displayName = getDisplayName(state.agent);

  return (
    <div className="rounded-lg border-2 border-blue-500 bg-blue-50/50 px-3 py-2.5 transition-colors duration-300">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-blue-500 animate-spin border-2 border-blue-200 border-t-blue-600" />
        <span className="text-sm font-medium text-blue-700">{displayName} 正在工作中</span>
      </div>
      {state.phase && (
        <div className="mt-1 text-xs text-blue-600">
          {state.phase}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Agent 完成卡片
// ============================================================================

interface AgentCompletedCardProps {
  state: AgentState;
  expanded?: boolean;
  onToggle?: () => void;
}

export function AgentCompletedCard({ state, expanded = false, onToggle }: AgentCompletedCardProps) {
  const displayName = getDisplayName(state.agent);
  const hasResult = state.result !== null && state.result !== undefined;

  // 特殊 agent 使用专用卡片
  if (state.agent === 'brief_compiler_agent' && state.result) {
    return <BriefResultCard brief={state.result} expanded={expanded} onToggle={onToggle} />;
  }

  if (state.agent === 'layout_planner_agent' && state.result) {
    return <LayoutSpecCard layoutSpec={state.result} expanded={expanded} onToggle={onToggle} />;
  }

  if ((state.agent === 'image_planner_agent' || state.agent === 'reference_intelligence_agent') && state.result) {
    return <AlignmentMapCard alignment={state.result} expanded={expanded} onToggle={onToggle} />;
  }

  if (state.agent === 'review_agent' && state.result) {
    return <QualityScoreCard scores={state.result} expanded={expanded} onToggle={onToggle} />;
  }

  // 通用完成卡片
  return (
    <div className="rounded-lg border border-green-200 bg-green-50/50 px-3 py-2 transition-colors duration-300">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-green-700">{displayName} 完成</span>
      </div>
      {hasResult && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 text-xs text-green-600 hover:text-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded-sm"
        >
          {expanded ? '收起详情' : '查看详情'}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Brief 结果卡片
// ============================================================================

interface BriefResultCardProps {
  brief: any;
  expanded?: boolean;
  onToggle?: () => void;
}

export function BriefResultCard({ brief, expanded = false, onToggle }: BriefResultCardProps) {
  const audience = brief?.targetAudience || brief?.audience || '';
  const goal = brief?.goal || brief?.objective || '';
  const style = brief?.style || brief?.tone || '';

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 overflow-hidden transition-colors duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-indigo-100/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-indigo-700">Brief 编译完成</span>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-indigo-500 transition-transform', expanded && 'rotate-180')} />
      </button>

      {!expanded && (
        <div className="px-3 pb-2 text-xs text-indigo-600">
          {[
            audience && `受众：${audience}`,
            goal && `目标：${goal}`,
            style && `风格：${style}`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {goal && (
            <div className="rounded-md bg-white/60 px-2 py-1.5">
              <div className="text-[11px] text-indigo-400">目标</div>
              <div className="mt-0.5 text-xs text-indigo-700">{goal}</div>
            </div>
          )}
          {audience && (
            <div className="rounded-md bg-white/60 px-2 py-1.5">
              <div className="text-[11px] text-indigo-400">受众</div>
              <div className="mt-0.5 text-xs text-indigo-700">{audience}</div>
            </div>
          )}
          {style && (
            <div className="rounded-md bg-white/60 px-2 py-1.5">
              <div className="text-[11px] text-indigo-400">风格</div>
              <div className="mt-0.5 text-xs text-indigo-700">{style}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 版式规划卡片
// ============================================================================

interface LayoutSpecCardProps {
  layoutSpec: any;
  expanded?: boolean;
  onToggle?: () => void;
}

export function LayoutSpecCard({ layoutSpec, expanded = false, onToggle }: LayoutSpecCardProps) {
  const layoutItems = normalizeLayoutSpec(layoutSpec?.layoutSpec || layoutSpec);
  const count = Number.isFinite(Number(layoutSpec?.count))
    ? Number(layoutSpec.count)
    : layoutItems.length;

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/50 overflow-hidden transition-colors duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-teal-100/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-teal-700">版式规划完成</span>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-teal-500 transition-transform', expanded && 'rotate-180')} />
      </button>

      {!expanded && (
        <div className="px-3 pb-2 text-xs text-teal-600">
          共 {count} 张图片
        </div>
      )}

      {expanded && layoutItems.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {layoutItems.map((spec: any, index: number) => (
            <div key={index} className="rounded-md bg-white/60 px-2 py-1.5">
              <div className="text-xs font-medium text-teal-700">图 {index + 1}</div>
              {spec.layoutType && (
                <div className="mt-0.5 text-[11px] text-teal-600">版式：{spec.layoutType}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 图文段落绑定卡片
// ============================================================================

interface AlignmentMapCardProps {
  alignment: any;
  expanded?: boolean;
  onToggle?: () => void;
}

export function AlignmentMapCard({ alignment, expanded = false, onToggle }: AlignmentMapCardProps) {
  const bindings = Array.isArray(alignment?.paragraphImageBindings)
    ? alignment.paragraphImageBindings
    : [];
  const blocks = Array.isArray(alignment?.bodyBlocks)
    ? alignment.bodyBlocks
    : [];

  const bindingsCount = Number.isFinite(Number(alignment?.bindingsCount))
    ? Number(alignment.bindingsCount)
    : bindings.length;
  const blocksCount = Number.isFinite(Number(alignment?.blocksCount))
    ? Number(alignment.blocksCount)
    : blocks.length;

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/50 overflow-hidden transition-colors duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-cyan-100/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-cyan-700">图文段落绑定完成</span>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-cyan-500 transition-transform', expanded && 'rotate-180')} />
      </button>

      <div className="px-3 pb-2 text-xs text-cyan-600">
        绑定 {bindingsCount} 条 · 段落 {blocksCount} 个
      </div>
    </div>
  );
}

// ============================================================================
// 质量评分卡片
// ============================================================================

interface QualityScoreCardProps {
  scores: any;
  expanded?: boolean;
  onToggle?: () => void;
}

export function QualityScoreCard({ scores, expanded = false, onToggle }: QualityScoreCardProps) {
  const overall = scores?.overall || 0;
  const scoresData = scores?.scores || {};

  const formatScore = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${Math.round(Math.max(0, Math.min(1, num)) * 100)}分`;
  };

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/50 overflow-hidden transition-colors duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-rose-100/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-rose-700">质量审核完成</span>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-rose-500 transition-transform', expanded && 'rotate-180')} />
      </button>

      {!expanded && (
        <div className="px-3 pb-2 text-xs text-rose-600">
          综合评分：{formatScore(overall)}
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className="rounded-md bg-white/60 px-2 py-1.5">
            <div className="text-[11px] text-rose-400">综合评分</div>
            <div className="mt-0.5 text-sm font-medium text-rose-700">{formatScore(overall)}</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(scoresData).map(([key, value]) => (
              <div key={key} className="rounded-md bg-white/60 px-2 py-1">
                <div className="text-[10px] text-rose-400">{getScoreLabel(key)}</div>
                <div className="mt-0.5 text-xs text-rose-600">{formatScore(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getScoreLabel(key: string): string {
  const labels: Record<string, string> = {
    infoDensity: '信息密度',
    textImageAlignment: '图文一致',
    styleConsistency: '风格一致',
    readability: '可读性',
    platformFit: '平台适配',
  };
  return labels[key] || key;
}
