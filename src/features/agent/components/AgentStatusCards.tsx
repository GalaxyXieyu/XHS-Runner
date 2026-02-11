import { cn } from '@/components/ui/utils';
import { ChevronDown, ChevronRight, FileText, LayoutGrid, ScanEye, ShieldCheck } from 'lucide-react';
import type { AgentEvent } from '../types';
import { getDisplayName } from './ToolEventList';

/** 截断字符串到指定长度 */
function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '...';
}

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
  inline?: boolean;
}

export function BriefResultCard({ brief, expanded = false, onToggle, inline = false }: BriefResultCardProps) {
  const audience = brief?.targetAudience || brief?.audience || '';
  const goal = brief?.goal || brief?.objective || '';
  const style = brief?.style || brief?.tone || '';
  const showExpanded = inline || expanded;

  return (
    <div className="rounded-xl bg-white/90 shadow-sm overflow-hidden transition-all duration-300">
      {!inline && (
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/40 hover:bg-slate-50/70 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Brief 编译完成</span>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}

      {!showExpanded && (
        <div className="px-3 pb-2 text-xs text-slate-600">
          {truncate([
            audience && `受众：${audience}`,
            goal && `目标：${goal}`,
            style && `风格：${style}`,
          ].filter(Boolean).join(' · '), 60)}
        </div>
      )}

      {showExpanded && (
        <div className={cn('space-y-2', inline ? 'px-3 py-3' : 'px-3 pb-3')}>
          {goal && (
            <div className="rounded-lg bg-slate-50/50 px-2.5 py-1.5">
              <div className="text-[11px] font-normal text-slate-400">目标</div>
              <div className="mt-0.5 text-xs font-medium text-slate-600">{goal}</div>
            </div>
          )}
          {audience && (
            <div className="rounded-lg bg-slate-50/50 px-2.5 py-1.5">
              <div className="text-[11px] font-normal text-slate-400">受众</div>
              <div className="mt-0.5 text-xs font-medium text-slate-600">{audience}</div>
            </div>
          )}
          {style && (
            <div className="rounded-lg bg-slate-50/50 px-2.5 py-1.5">
              <div className="text-[11px] font-normal text-slate-400">风格</div>
              <div className="mt-0.5 text-xs font-medium text-slate-600">{style}</div>
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

// role 翻译
function translateRole(role: string): string {
  const roleMap: Record<string, string> = {
    cover: '封面',
    detail: '详情',
    result: '结果',
  };
  return roleMap[role] || role;
}

// area 翻译
function translateArea(area: string): string {
  const areaMap: Record<string, string> = {
    title: '标题',
    body: '正文',
    visual_focus: '视觉焦点',
    header: '头部',
    footer: '底部',
    image: '图片',
    text: '文字',
  };
  return areaMap[area] || area;
}

interface LayoutSpecCardProps {
  layoutSpec: any;
  expanded?: boolean;
  onToggle?: () => void;
  inline?: boolean;
}

export function LayoutSpecCard({ layoutSpec, expanded = false, onToggle, inline = false }: LayoutSpecCardProps) {
  const layoutItems = normalizeLayoutSpec(layoutSpec?.layoutSpec || layoutSpec);
  const count = Number.isFinite(Number(layoutSpec?.count))
    ? Number(layoutSpec.count)
    : layoutItems.length;
  const showExpanded = inline || expanded;

  // 提取偏好/风格信息
  const preference = layoutSpec?.preference || layoutSpec?.bias || '';

  return (
    <div className="rounded-xl bg-white/90 shadow-sm overflow-hidden transition-all duration-300">
      {!inline && (
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/40 hover:bg-slate-50/70 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-3.5 h-3.5 text-red-400" />
            <span className="text-sm font-semibold text-slate-700">版式规划完成</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full font-normal">
              {count} 张
            </span>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}

      {!showExpanded && layoutItems.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {layoutItems.map((spec: any, index: number) => (
            <span key={index} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-slate-50 text-slate-600 rounded-lg">
              <span className="font-medium">图{index + 1}</span>
              {(spec.role || spec.layoutType) && <span className="text-red-400">· {translateRole(spec.role || spec.layoutType)}</span>}
            </span>
          ))}
          {preference && (
            <span className="text-[10px] text-slate-500 ml-1">偏好={preference}</span>
          )}
        </div>
      )}

      {showExpanded && layoutItems.length > 0 && (
        <div className={cn(inline ? 'px-3 py-3' : 'px-3 pb-3')}>
          <div className="grid grid-cols-2 gap-1.5">
            {layoutItems.map((spec: any, index: number) => (
              <div key={index} className="rounded-lg bg-slate-50/50 px-2.5 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-700">图 {index + 1}</span>
                  {(spec.role || spec.layoutType) && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-500 rounded font-medium">
                      {translateRole(spec.role || spec.layoutType)}
                    </span>
                  )}
                </div>
                {spec.visualFocus && (
                  <div className="text-[10px] text-slate-500">焦点 {spec.visualFocus}</div>
                )}
                {spec.textDensity && (
                  <div className="text-[10px] text-slate-500">密度 {spec.textDensity}</div>
                )}
                {spec.imageSize && (
                  <div className="text-[10px] text-slate-500">尺寸 {spec.imageSize}</div>
                )}
                {spec.textZone && (
                  <div className="text-[10px] text-slate-500">文字区 {typeof spec.textZone === 'string' ? spec.textZone : JSON.stringify(spec.textZone)}</div>
                )}
                {spec.description && (
                  <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{spec.description}</div>
                )}
                {Array.isArray(spec.blocks) && spec.blocks.length > 0 && (
                  <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                    {spec.blocks.map((b: any, bi: number) => (
                      <div key={bi} className="truncate">{translateArea(b.area)} {b.instruction}</div>
                    ))}
                  </div>
                )}
                {spec.colorScheme && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-slate-500">配色：</span>
                    {Array.isArray(spec.colorScheme)
                      ? spec.colorScheme.map((c: string, ci: number) => (
                          <span key={ci} className="w-3 h-3 rounded-sm border border-slate-200" style={{ backgroundColor: c }} title={c} />
                        ))
                      : <span className="text-[10px] text-slate-500">{String(spec.colorScheme)}</span>
                    }
                  </div>
                )}
              </div>
            ))}
          </div>
          {preference && (
            <div className="mt-2 text-[10px] text-slate-500">
              整体偏好：{preference}
            </div>
          )}
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
  inline?: boolean;
}

export function AlignmentMapCard({ alignment, expanded = false, onToggle, inline = false }: AlignmentMapCardProps) {
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
    <div className="rounded-xl bg-white/90 shadow-sm overflow-hidden transition-all duration-300">
      {!inline && (
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/40 hover:bg-slate-50/70 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <ScanEye className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">图文段落绑定完成</span>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}

      <div className={cn('text-xs text-slate-600', inline ? 'px-3 py-2' : 'px-3 pb-2')}>
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
  inline?: boolean;
}

export function QualityScoreCard({ scores, expanded = false, onToggle, inline = false }: QualityScoreCardProps) {
  const overall = scores?.overall || 0;
  const scoresData = scores?.scores || {};
  const showExpanded = inline || expanded;

  const formatScore = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return `${Math.round(Math.max(0, Math.min(1, num)) * 100)}分`;
  };

  return (
    <div className="rounded-xl bg-white/90 shadow-sm overflow-hidden transition-all duration-300">
      {!inline && (
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/40 hover:bg-slate-50/70 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">质量审核完成</span>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}

      {!showExpanded && (
        <div className="px-3 pb-2 text-xs text-slate-600">
          综合评分：{formatScore(overall)}
        </div>
      )}

      {showExpanded && (
        <div className={cn('space-y-2', inline ? 'px-3 py-3' : 'px-3 pb-3')}>
          <div className="rounded-lg bg-slate-50/50 px-2.5 py-1.5">
            <div className="text-[11px] font-normal text-slate-400">综合评分</div>
            <div className={cn('mt-0.5 text-sm font-medium', overall >= 0.8 ? 'text-emerald-600' : 'text-slate-700')}>
              {formatScore(overall)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(scoresData).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-slate-50/50 px-2 py-1">
                <div className="text-[10px] font-normal text-slate-400">{getScoreLabel(key)}</div>
                <div className={cn('mt-0.5 text-xs', Number(value) >= 0.8 ? 'text-emerald-600' : 'text-slate-600')}>
                  {formatScore(value)}
                </div>
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
