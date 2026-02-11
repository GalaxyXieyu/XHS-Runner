import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type CreativeBrief } from "../state/agentState";
import { compressContext, safeSliceMessages, formatSupervisorGuidance } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { analyzeRequirementClarity, extractLatestUserRequirement } from "../utils/requirementClarity";
import { requestAgentClarification } from "../utils/agentClarification";

function parseBrief(content: string): CreativeBrief {
  const fallback: CreativeBrief = {
    audience: "小红书用户",
    goal: "提升互动并传达核心信息",
    keyPoints: ["核心价值", "使用场景", "行动建议"],
    callToAction: "欢迎评论区交流",
    bannedExpressions: [],
    tone: "真实、清晰、有温度",
  };

  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return {
      audience: parsed.audience || fallback.audience,
      goal: parsed.goal || fallback.goal,
      keyPoints: Array.isArray(parsed.keyPoints) && parsed.keyPoints.length > 0
        ? parsed.keyPoints.map((v: unknown) => String(v))
        : fallback.keyPoints,
      callToAction: parsed.callToAction || fallback.callToAction,
      bannedExpressions: Array.isArray(parsed.bannedExpressions)
        ? parsed.bannedExpressions.map((v: unknown) => String(v))
        : fallback.bannedExpressions,
      tone: parsed.tone || fallback.tone,
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
  const systemPrompt = promptFromStore || `你是创作任务梳理专家。\n
请根据用户需求提炼创作 brief，并仅输出 JSON：
{
  "audience": "目标受众",
  "goal": "创作目标",
  "keyPoints": ["核心点1", "核心点2", "核心点3"],
  "callToAction": "行动引导",
  "bannedExpressions": ["不要使用的表达"],
  "tone": "语气风格"
}`;

  const response = await model.invoke([
    new HumanMessage(systemPrompt),
    ...(supervisorGuidance ? [new HumanMessage(supervisorGuidance)] : []),
    ...safeSliceMessages(compressed.messages, 6),
  ]);

  const raw = typeof response.content === "string" ? response.content : "";
  const creativeBrief = parseBrief(raw);

  const summaryMessage = new AIMessage(
    `Brief 已生成：受众=${creativeBrief.audience}，目标=${creativeBrief.goal}，核心点=${creativeBrief.keyPoints.join(" / ")}`
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
