import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type CreativeBrief } from "../state/agentState";
import { compressContext, safeSliceMessages, formatSupervisorGuidance } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { analyzeRequirementClarity, extractLatestUserRequirement } from "../utils/requirementClarity";
import { requestAgentClarification } from "../utils/agentClarification";

function parseBrief(content: string): CreativeBrief {
  const fallback: CreativeBrief = {
    topic: "未指定",
    audience: "小红书用户",
    goal: "提升互动",
    constraints: [],
    keywords: [],
  };

  const toStringArray = (value: unknown, max: number): string[] => {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
    }
    if (typeof value === "string") {
      return value
        .split(/[\n,，、;；]+/)
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, max);
    }
    return [];
  };

  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);

    const topic = typeof parsed.topic === "string" ? parsed.topic.trim() : "";
    const audience = typeof parsed.audience === "string" ? parsed.audience.trim() : "";
    const goal = typeof parsed.goal === "string" ? parsed.goal.trim() : "";
    const constraints = toStringArray(parsed.constraints, 3);
    const keywords = toStringArray(parsed.keywords, 5);

    return {
      topic: topic || fallback.topic,
      audience: audience || fallback.audience,
      goal: goal || fallback.goal,
      constraints,
      keywords,

      // legacy passthrough (optional)
      keyPoints: toStringArray(parsed.keyPoints, 5),
      callToAction: typeof parsed.callToAction === "string" ? parsed.callToAction : undefined,
      bannedExpressions: toStringArray(parsed.bannedExpressions, 10),
      tone: typeof parsed.tone === "string" ? parsed.tone : undefined,
    };
  } catch {
    return fallback;
  }
}

export async function briefCompilerNode(state: typeof AgentState.State, model: ChatOpenAI) {
  if (state.creativeBrief && state.briefComplete) {
    return {
      currentAgent: "brief_compiler_agent" as AgentType,
      briefComplete: true,
    };
  }

  const latestRequirement = extractLatestUserRequirement(state.messages);
  const clarityReport = analyzeRequirementClarity(latestRequirement);
  if (clarityReport.level === "low") {
    const clarificationResult = requestAgentClarification(state, {
      key: "brief_compiler_agent.requirement_scope",
      agent: "brief_compiler_agent",
      question: "为了让 brief 更准确，你希望先补充哪些关键信息？",
      options: [
        { id: "add_audience", label: "补充目标人群", description: "例如新手、学生党、职场人" },
        { id: "add_goal", label: "补充创作目标", description: "例如提升收藏、评论、转化" },
        { id: "add_style", label: "补充风格结构", description: "例如清单体、口语化、强干货" },
        { id: "continue_default", label: "按默认继续", description: "不补充，直接用默认策略" },
      ],
      selectionType: "single",
      allowCustomInput: true,
      context: {
        missingDimensions: clarityReport.missingDimensions,
        clarityScore: Number(clarityReport.score.toFixed(2)),
      },
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "brief_compiler_agent" as AgentType,
        briefComplete: false,
      };
    }
  }

  const compressed = await compressContext(state, model);

  const supervisorGuidance = formatSupervisorGuidance(state, "brief_compiler_agent");

  const promptFromStore = await getAgentPrompt("brief_compiler_agent");
  const systemPrompt = promptFromStore || `你是需求梳理专家。将用户需求转化为结构化 brief，只输出必要字段。

只输出 JSON：
{
  "topic": "主题（≤10字）",
  "audience": "受众（≤8字）",
  "goal": "目标（≤15字）",
  "constraints": ["约束1"],
  "keywords": ["关键词1", "关键词2"]
}

规则：
1) 只输出 JSON，禁止任何解释
2) constraints 最多3条，keywords 最多5个`;

  const response = await model.invoke([
    new HumanMessage(systemPrompt),
    ...(supervisorGuidance ? [new HumanMessage(supervisorGuidance)] : []),
    ...safeSliceMessages(compressed.messages, 6),
  ]);

  const raw = typeof response.content === "string" ? response.content : "";
  const creativeBrief = parseBrief(raw);

  const summaryMessage = new AIMessage(
    `Brief 已生成：主题=${creativeBrief.topic}，受众=${creativeBrief.audience}，目标=${creativeBrief.goal}，关键词=${creativeBrief.keywords.join(" / ") || "-"}`
  );

  return {
    messages: [summaryMessage],
    currentAgent: "brief_compiler_agent" as AgentType,
    briefComplete: true,
    creativeBrief,
    summary: compressed.summary,
    lastError: null,
  };
}
