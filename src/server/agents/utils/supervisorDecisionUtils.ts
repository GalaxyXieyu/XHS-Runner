import { AgentState, type AgentType, type SupervisorDecision } from "../state/agentState";

const ALLOWED_AGENTS: AgentType[] = [
  "brief_compiler_agent",
  "research_evidence_agent",
  "reference_intelligence_agent",
  "layout_planner_agent",
  "writer_agent",
  "image_planner_agent",
  "image_agent",
  "review_agent",
  "supervisor",
];

const MAX_TEXT_LENGTH = 200;

function truncateText(value: string, maxLength = MAX_TEXT_LENGTH): string {
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return truncateText(value.trim());
}

function normalizeFocusAreas(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter(Boolean)
      .slice(0, 5);
  }

  if (typeof value === "string") {
    return value
      .split(/[,，;；]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  return [];
}

function extractJson(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

export function parseSupervisorDecision(content: string): SupervisorDecision | null {
  const jsonText = extractJson(content);
  if (!jsonText) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  const nextRaw = typeof parsed.next_agent === "string" ? parsed.next_agent.trim() : "";
  if (!nextRaw) return null;

  if (nextRaw !== "END" && !ALLOWED_AGENTS.includes(nextRaw as AgentType)) {
    return null;
  }

  return {
    nextAgent: nextRaw as AgentType | "END",
    guidance: normalizeText(parsed.guidance),
    contextFromPrevious: normalizeText(parsed.context_from_previous),
    focusAreas: normalizeFocusAreas(parsed.focus_areas),
  };
}

export function formatSupervisorGuidance(
  state: typeof AgentState.State,
  agent: AgentType
): string {
  const decision = state.supervisorDecision;
  if (!decision || decision.nextAgent !== agent) return "";

  const lines = ["【Supervisor 指令】", `- next_agent: ${decision.nextAgent}`];
  if (decision.guidance) lines.push(`- guidance: ${decision.guidance}`);
  if (decision.contextFromPrevious) {
    lines.push(`- context_from_previous: ${decision.contextFromPrevious}`);
  }
  if (decision.focusAreas.length > 0) {
    lines.push(`- focus_areas: ${decision.focusAreas.join("、")}`);
  }

  return lines.join("\n");
}

export function buildPreviousAgentSummary(state: typeof AgentState.State): string {
  const agent = state.currentAgent;

  switch (agent) {
    case "brief_compiler_agent": {
      if (!state.creativeBrief) return "brief 未生成";
      const brief = state.creativeBrief;
      const keyPointsCount = brief.keyPoints?.length || 0;
      const summary = `受众:${brief.audience || "-"} 目标:${brief.goal || "-"} 关键点:${keyPointsCount}项`;
      return truncateText(summary, 140);
    }
    case "research_evidence_agent": {
      const summary = state.evidencePack?.summary || "研究证据未产出";
      const count = state.evidencePack?.items?.length || 0;
      return truncateText(`证据:${count}条 | 摘要:${summary}`, 160);
    }
    case "reference_intelligence_agent": {
      const count = state.referenceAnalyses?.length || 0;
      return `参考解析:${count}项`;
    }
    case "writer_agent": {
      const title = state.generatedContent?.title || "";
      const bodyLength = state.generatedContent?.body?.length || 0;
      const base = title ? `标题:${title} | 正文:${bodyLength}字` : `正文:${bodyLength}字`;
      return truncateText(base, 160);
    }
    case "layout_planner_agent": {
      const count = state.layoutSpec?.length || 0;
      return `版式规划:${count}张`;
    }
    case "image_planner_agent": {
      const count = state.imagePlans?.length || 0;
      return `图片规划:${count}张`;
    }
    case "image_agent": {
      return `已生成图片:${state.generatedImageCount || 0}张`;
    }
    case "review_agent": {
      if (!state.reviewFeedback) return "审核未产出";
      const status = state.reviewFeedback.approved ? "通过" : "需优化";
      const suggestionsCount = state.reviewFeedback.suggestions?.length || 0;
      return `审核:${status} | 建议:${suggestionsCount}条`;
    }
    case "supervisor":
    default:
      return "无";
  }
}
