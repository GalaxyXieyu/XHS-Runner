import type { AgentEvent, ImageTask } from '../types';
import { getAgentStates } from '../components/AgentStatusCards';
import { getAgentDisplayName } from '../components/AgentCreatorConfig';
import { parseCreativeContent, type ParsedContent } from '../components/ContentCard';
import { parseImagePlanContent } from '../components/ImagePlanCard';

export type StreamItemKind = 'tool' | 'plan' | 'result' | 'content' | 'image_plan' | 'status';

export interface StreamItem {
  id: string;
  kind: StreamItemKind;
  title: string;
  timestamp: number;
  agentKey: string;
  agentLabel: string;
  payload: unknown;
}

export interface AgentGroup {
  id: string;
  agentKey: string;
  label: string;
  items: StreamItem[];
  status: 'working' | 'completed';
  containsLatest: boolean;
  order: number;
  durationMs?: number;
}

export interface StageNode {
  id: string;
  agentKey: string;
  label: string;
  decisionLabel?: string;
  decisionReason?: string;
  status: 'working' | 'completed';
  startedAt: number;
  endedAt?: number;
  groups: AgentGroup[];
}

export interface FinalContent {
  content: ParsedContent;
  imageTasks: ImageTask[];
  isStreaming: boolean;
}

export interface AgentTimeline {
  currentStage: StageNode | null;
  historyStages: StageNode[];
  finalContent: FinalContent | null;
  nextDecisionLabel?: string;
  hasOutputs: boolean;
}

interface BuildAgentTimelineOptions {
  events: AgentEvent[];
  messageContent: string;
  imageTasks: ImageTask[];
  isStreaming: boolean;
  isHistoricalMessage: boolean;
  isLastAssistantMessage: boolean;
  isHITLRequest: boolean;
  streamPhase: string;
}

/** 内部节点不应出现在用户可见的执行轨迹中 */
function isInternalNode(agentKey: string): boolean {
  if (!agentKey) return false;
  if (agentKey === 'supervisor' || agentKey === 'supervisor_route') return true;
  if (agentKey === 'supervisor_with_style') return true;
  // _tools 节点不过滤，通过 normalizeAgentKey 归属到父 agent
  return false;
}

/** 将 _tools 节点归一化到父 agent（例如 research_evidence_agent_tools → research_evidence_agent） */
function normalizeAgentKey(agentKey: string): string {
  if (agentKey.endsWith('_tools')) {
    return agentKey.slice(0, -6); // 移除 "_tools"
  }
  return agentKey;
}

function findLastEvent(events: AgentEvent[], predicate: (event: AgentEvent) => boolean): AgentEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (predicate(event)) return event;
  }
  return null;
}

function createItemId(prefix: string, counter: { value: number }) {
  const id = `${prefix}-${counter.value}`;
  counter.value += 1;
  return id;
}

export function buildAgentTimeline({
  events,
  messageContent,
  imageTasks,
  isStreaming,
  isHistoricalMessage,
  isLastAssistantMessage,
  isHITLRequest,
  streamPhase,
}: BuildAgentTimelineOptions): AgentTimeline {
  const agentStates = getAgentStates(events);

  const supervisorDecisions = events.filter((event) => event.type === 'supervisor_decision');
  const agentStartEvents = events.filter((event) => event.type === 'agent_start');
  const latestDecision = supervisorDecisions[supervisorDecisions.length - 1];
  const latestAgentStart = agentStartEvents[agentStartEvents.length - 1];

  const researchEvents = events.filter(
    (event) =>
      (event.agent === 'research_agent' || event.agent === 'research_evidence_agent') &&
      event.type === 'message'
  );
  const writerEvents = events.filter((event) => event.agent === 'writer_agent' && event.type === 'message');
  const imagePlannerEvents = events.filter((event) => event.agent === 'image_planner_agent' && event.type === 'message');
  const workflowCompleteEvent = events.find((event) => event.type === 'workflow_complete') as AgentEvent | undefined;
  const toolEvents = events.filter((event) => event.type === 'tool_call' || event.type === 'tool_result');

  const researchContent = researchEvents.length > 0
    ? researchEvents[researchEvents.length - 1]?.content || ''
    : '';

  // 解析创作内容：优先 workflow_complete 结构化数据 → writer 流式内容
  let parsedContent: ParsedContent | null = null;
  if (workflowCompleteEvent && (workflowCompleteEvent.title || workflowCompleteEvent.body)) {
    parsedContent = {
      title: workflowCompleteEvent.title || '',
      body: workflowCompleteEvent.body || '',
      tags: workflowCompleteEvent.tags || [],
    };
  } else {
    const writerContent = writerEvents.map((event) => event.content).join('\n');
    parsedContent = parseCreativeContent(writerContent);
  }
  // 注意：不再使用 messageContent 的 fallback 解析，避免把 Brief/JSON 中间数据当成创作内容

  const imagePlannerContent = imagePlannerEvents.map((event) => event.content).join('\n');
  const parsedImagePlan = parseImagePlanContent(imagePlannerContent);

  const briefState = agentStates.get('brief_compiler_agent');
  const layoutState = agentStates.get('layout_planner_agent');
  const imagePlannerState = agentStates.get('image_planner_agent') || agentStates.get('reference_intelligence_agent');
  const reviewState = agentStates.get('review_agent');
  const writerState = agentStates.get('writer_agent');
  const researchState = agentStates.get('research_evidence_agent') || agentStates.get('research_agent');

  const briefTimestamp = findLastEvent(events, (event) => event.type === 'brief_ready')?.timestamp
    || briefState?.endTime
    || 0;
  const layoutTimestamp = findLastEvent(events, (event) => event.type === 'layout_spec_ready')?.timestamp
    || layoutState?.endTime
    || 0;
  const alignmentTimestamp = findLastEvent(events, (event) => event.type === 'alignment_map_ready')?.timestamp
    || imagePlannerState?.endTime
    || 0;
  const reviewTimestamp = findLastEvent(events, (event) => event.type === 'quality_score')?.timestamp
    || reviewState?.endTime
    || 0;
  const researchTimestamp = researchState?.endTime
    || researchEvents[researchEvents.length - 1]?.timestamp
    || 0;
  const writerTimestamp = workflowCompleteEvent?.timestamp
    || writerState?.endTime
    || writerEvents[writerEvents.length - 1]?.timestamp
    || 0;
  const imagePlanTimestamp = imagePlannerEvents[imagePlannerEvents.length - 1]?.timestamp
    || imagePlannerState?.endTime
    || 0;

  const shouldIncludeResearch = researchContent || toolEvents.length > 0;

  const shouldShowImages = !!workflowCompleteEvent
    || (isHistoricalMessage && isLastAssistantMessage && !isHITLRequest);

  let finalImageTasks: ImageTask[] = [];
  if (shouldShowImages) {
    if (workflowCompleteEvent?.imageAssetIds?.length) {
      finalImageTasks = workflowCompleteEvent.imageAssetIds.map((assetId: number, index: number) => ({
        id: index + 1,
        prompt: '',
        status: 'done' as const,
        assetId,
      }));
    } else {
      const allDone = imageTasks.length > 0 && imageTasks.every((task) => task.status === 'done');
      finalImageTasks = allDone ? imageTasks : [];
    }
  }

  // finalContent 只在 workflow 真正完成时展示（避免 HITL 暂停消息重复显示）
  const isFinalContent = !!parsedContent && !!workflowCompleteEvent;
  const finalContent = isFinalContent && parsedContent
    ? {
        content: parsedContent,
        imageTasks: finalImageTasks,
        isStreaming: false,
      }
    : null;

  const itemCounter = { value: 0 };
  const outputItems: StreamItem[] = [];
  const handledAgents = new Set<string>();

  const pushItem = (item: StreamItem) => {
    if (!Number.isFinite(item.timestamp) || item.timestamp <= 0) return;
    outputItems.push(item);
  };

  if (briefState?.result) {
    handledAgents.add(briefState.agent || 'brief_compiler_agent');
    pushItem({
      id: createItemId('brief', itemCounter),
      kind: 'result',
      title: 'Brief',
      agentKey: briefState.agent || 'brief_compiler_agent',
      agentLabel: getAgentDisplayName(briefState.agent || 'brief_compiler_agent'),
      timestamp: briefTimestamp,
      payload: { state: briefState },
    });
  }

  if (shouldIncludeResearch) {
    handledAgents.add(researchState?.agent || 'research_evidence_agent');
    pushItem({
      id: createItemId('research', itemCounter),
      kind: 'tool',
      title: '研究过程',
      agentKey: researchState?.agent || 'research_evidence_agent',
      agentLabel: getAgentDisplayName(researchState?.agent || 'research_evidence_agent'),
      timestamp: researchTimestamp,
      payload: {
        events,
        researchContent,
        isLoading: isStreaming,
        streamPhase,
      },
    });
  }

  // 创作内容预览：仅在当前活跃流中显示（非历史消息），避免 HITL 暂停消息重复
  if (parsedContent && !isFinalContent && !isHistoricalMessage) {
    handledAgents.add('writer_agent');
    pushItem({
      id: createItemId('content', itemCounter),
      kind: 'content',
      title: '创作输出',
      agentKey: 'writer_agent',
      agentLabel: getAgentDisplayName('writer_agent'),
      timestamp: writerTimestamp,
      payload: {
        content: parsedContent,
        imageTasks: [],
        isStreaming: isStreaming && !workflowCompleteEvent,
      },
    });
  }

  if (parsedImagePlan) {
    handledAgents.add(imagePlannerState?.agent || 'image_planner_agent');
    pushItem({
      id: createItemId('image-plan', itemCounter),
      kind: 'image_plan',
      title: '图片规划',
      agentKey: imagePlannerState?.agent || 'image_planner_agent',
      agentLabel: getAgentDisplayName(imagePlannerState?.agent || 'image_planner_agent'),
      timestamp: imagePlanTimestamp,
      payload: { imagePlan: parsedImagePlan },
    });
  }

  if (layoutState?.result) {
    handledAgents.add(layoutState.agent || 'layout_planner_agent');
    pushItem({
      id: createItemId('layout', itemCounter),
      kind: 'result',
      title: '版式规划',
      agentKey: layoutState.agent || 'layout_planner_agent',
      agentLabel: getAgentDisplayName(layoutState.agent || 'layout_planner_agent'),
      timestamp: layoutTimestamp,
      payload: { state: layoutState },
    });
  }

  if (imagePlannerState?.result) {
    handledAgents.add(imagePlannerState.agent || 'image_planner_agent');
    pushItem({
      id: createItemId('alignment', itemCounter),
      kind: 'result',
      title: '图文段落绑定',
      agentKey: imagePlannerState.agent || 'image_planner_agent',
      agentLabel: getAgentDisplayName(imagePlannerState.agent || 'image_planner_agent'),
      timestamp: alignmentTimestamp,
      payload: { state: imagePlannerState },
    });
  }

  if (reviewState?.result) {
    handledAgents.add(reviewState.agent || 'review_agent');
    pushItem({
      id: createItemId('review', itemCounter),
      kind: 'result',
      title: '质量审核',
      agentKey: reviewState.agent || 'review_agent',
      agentLabel: getAgentDisplayName(reviewState.agent || 'review_agent'),
      timestamp: reviewTimestamp,
      payload: { state: reviewState },
    });
  }

  Array.from(agentStates.values())
    .filter((state) => state.status === 'completed')
    .forEach((state) => {
      const rawKey = state.agent || 'unknown';
      if (isInternalNode(rawKey)) return;
      // _tools 归一化到父 agent，避免产生独立条目
      const agentKey = normalizeAgentKey(rawKey);
      if (handledAgents.has(agentKey)) return;

      pushItem({
        id: createItemId('completed', itemCounter),
        kind: 'result',
        title: '完成',
        agentKey,
        agentLabel: getAgentDisplayName(agentKey),
        timestamp: state.endTime || state.startTime,
        payload: { state },
      });
      handledAgents.add(agentKey);
    });

  Array.from(agentStates.values())
    .filter((state) => state.status === 'working')
    .forEach((state) => {
      const rawKey = state.agent || 'unknown';
      if (isInternalNode(rawKey)) return;
      const agentKey = normalizeAgentKey(rawKey);
      pushItem({
        id: createItemId('working', itemCounter),
        kind: 'status',
        title: '进行中',
        agentKey,
        agentLabel: getAgentDisplayName(agentKey),
        timestamp: state.startTime,
        payload: { state },
      });
    });

  outputItems.sort((a, b) => a.timestamp - b.timestamp);
  const latestItem = outputItems[outputItems.length - 1];

  const stages: StageNode[] = [];
  const findDecisionBefore = (timestamp: number) => {
    for (let i = supervisorDecisions.length - 1; i >= 0; i -= 1) {
      const decision = supervisorDecisions[i];
      if (decision.timestamp <= timestamp) return decision;
    }
    return null;
  };

  agentStartEvents.forEach((event, index) => {
    const rawKey = event.agent || 'unknown';
    if (isInternalNode(rawKey)) return;
    // _tools 节点不创建独立 stage，其内容归属到父 agent 的 group
    if (rawKey.endsWith('_tools')) return;

    const agentKey = rawKey;
    const decision = findDecisionBefore(event.timestamp);
    const label = getAgentDisplayName(agentKey);
    stages.push({
      id: `stage-${index}`,
      agentKey,
      label: label || '阶段',
      decisionLabel: decision?.decision ? getAgentDisplayName(decision.decision) : label,
      decisionReason: decision?.reason || '',
      status: agentStates.get(agentKey)?.status || 'working',
      startedAt: event.timestamp,
      endedAt: agentStates.get(agentKey)?.endTime,
      groups: [],
    });
  });

  const stageList: StageNode[] = [];
  const firstStageStart = stages[0]?.startedAt ?? Number.POSITIVE_INFINITY;
  const hasPreItems = outputItems.some((item) => item.timestamp < firstStageStart);

  if (hasPreItems && stages.length > 0) {
    stageList.push({
      id: 'stage-pre',
      agentKey: 'pre',
      label: '准备阶段',
      decisionLabel: supervisorDecisions[0]?.decision
        ? getAgentDisplayName(supervisorDecisions[0].decision)
        : '准备阶段',
      decisionReason: supervisorDecisions[0]?.reason || '',
      status: 'completed',
      startedAt: outputItems[0]?.timestamp || 0,
      groups: [],
    });
  }

  if (stages.length === 0) {
    stageList.push({
      id: 'stage-pre',
      agentKey: 'pre',
      label: '准备阶段',
      decisionLabel: latestDecision?.decision
        ? getAgentDisplayName(latestDecision.decision)
        : '准备阶段',
      decisionReason: latestDecision?.reason || '',
      status: 'working',
      startedAt: outputItems[0]?.timestamp || 0,
      groups: [],
    });
  } else {
    stageList.push(...stages);
  }

  const getStageForTimestamp = (timestamp: number) => {
    let selected = stageList[0];
    for (const stage of stageList) {
      if (stage.startedAt <= timestamp) {
        selected = stage;
      } else {
        break;
      }
    }
    return selected;
  };

  const groupMaps = new Map<string, Map<string, AgentGroup>>();

  outputItems.forEach((item) => {
    const stage = getStageForTimestamp(item.timestamp);
    const stageKey = stage.id;
    if (!groupMaps.has(stageKey)) {
      groupMaps.set(stageKey, new Map());
    }
    const groupMap = groupMaps.get(stageKey)!;
    // _tools 归一化到父 agent 的 group
    const groupKey = normalizeAgentKey(item.agentKey);
    const groupLabel = getAgentDisplayName(groupKey);
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        id: `${stageKey}:${groupKey}`,
        agentKey: groupKey,
        label: groupLabel,
        items: [],
        status: 'completed',
        containsLatest: false,
        order: item.timestamp,
      });
    }
    const group = groupMap.get(groupKey)!;
    group.items.push(item);
    group.order = Math.min(group.order, item.timestamp);
    if (latestItem && item.id === latestItem.id) {
      group.containsLatest = true;
    }
    if (item.kind === 'status') {
      group.status = 'working';
    }
  });

  stageList.forEach((stage) => {
    const groupMap = groupMaps.get(stage.id);
    if (!groupMap) return;
    const groups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order);
    groups.forEach((group) => {
      group.items.sort((a, b) => a.timestamp - b.timestamp);
      // 从 agentStates 计算 durationMs
      const state = agentStates.get(group.agentKey);
      if (state?.startTime && state?.endTime) {
        group.durationMs = state.endTime - state.startTime;
      }
    });
    stage.groups = groups;
    if (groups.some((group) => group.status === 'working')) {
      stage.status = 'working';
    }
  });

  const filteredStages = stageList.filter((stage) => stage.groups.length > 0);
  const currentStage = filteredStages[filteredStages.length - 1] || stageList[stageList.length - 1] || null;
  const historyStages = filteredStages.filter((stage) => stage.id !== currentStage?.id);

  const nextDecisionLabel = latestDecision && latestAgentStart && latestDecision.timestamp > latestAgentStart.timestamp
    ? getAgentDisplayName(latestDecision.decision || '')
    : undefined;

  const hasOutputs = !!finalContent
    || (currentStage && currentStage.groups.length > 0)
    || historyStages.length > 0;

  return {
    currentStage,
    historyStages,
    finalContent,
    nextDecisionLabel,
    hasOutputs,
  };
}

export type { BuildAgentTimelineOptions };
