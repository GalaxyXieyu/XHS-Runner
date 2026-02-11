import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type EvidencePack } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { researchTools } from "../tools";
import { requestAgentClarification } from "../utils/agentClarification";

function parseEvidencePack(content: string): EvidencePack {
  const fallback: EvidencePack = {
    items: [],
    summary: "未提取到结构化研究证据",
  };

  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      const lines = content
        .split(/\n+/)
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 5);
      return {
        items: lines.map((fact) => ({ fact })),
        summary: lines.join("；") || fallback.summary,
      };
    }

    const parsed = JSON.parse(match[0]);
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item: any) => ({
            fact: String(item.fact || "").trim(),
            source: item.source ? String(item.source) : undefined,
            quote: item.quote ? String(item.quote) : undefined,
          }))
          .filter((item: any) => item.fact)
      : [];

    return {
      items,
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : fallback.summary,
    };
  } catch {
    return fallback;
  }
}

export async function researchEvidenceNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const briefKeyPoints = state.creativeBrief?.keyPoints || [];
  const needEvidenceDirection = briefKeyPoints.length < 2 && !state.evidenceComplete;
  if (needEvidenceDirection) {
    const clarificationResult = requestAgentClarification(state, {
      key: "research_evidence_agent.focus",
      agent: "research_evidence_agent",
      question: "研究阶段你更希望优先补哪类证据？",
      options: [
        { id: "trend_data", label: "趋势数据", description: "优先找最新趋势与增量信号" },
        { id: "user_pain", label: "用户痛点", description: "优先找常见问题与避坑点" },
        { id: "practical_steps", label: "实操方法", description: "优先找可执行步骤与参数" },
        { id: "continue_default", label: "按默认研究", description: "不指定方向，系统自行平衡" },
      ],
      selectionType: "single",
      allowCustomInput: true,
      context: {
        briefKeyPoints,
      },
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "research_evidence_agent" as AgentType,
        researchComplete: false,
        evidenceComplete: false,
      };
    }
  }

  const modelWithTools = model.bindTools(researchTools);
  const compressed = await compressContext(state, model);

  const promptFromStore = await getAgentPrompt("research_evidence_agent");
  const systemPrompt =
    promptFromStore ||
    `你是研究证据提炼专家。\n\n最后必须输出 JSON：\n{\n  "summary": "研究摘要",\n  "items": [\n    {"fact": "可验证结论", "source": "来源", "quote": "可选引用"}\n  ]\n}`;

  // 构建 Brief 上下文提示，确保 LLM 知道要搜索什么
  const brief = state.creativeBrief;
  const briefParts: string[] = [];
  if (brief) {
    if (brief.keyPoints?.length) briefParts.push(`核心关键词：${brief.keyPoints.join("、")}`);
    if (brief.audience) briefParts.push(`目标受众：${brief.audience}`);
    if (brief.goal) briefParts.push(`创作目标：${brief.goal}`);
    if (brief.tone) briefParts.push(`风格基调：${brief.tone}`);
  }

  // 从对话消息中提取用户的原始需求（第一条 human 消息）
  const userMessages = (state.messages || []).filter(
    (m: any) => m._getType?.() === "human" || m.constructor?.name === "HumanMessage"
  );
  const originalRequirement = userMessages.length > 0
    ? (typeof userMessages[0].content === "string" ? userMessages[0].content : "").slice(0, 300)
    : "";

  const briefHint = briefParts.length > 0 || originalRequirement
    ? [
        "【研究任务上下文】",
        originalRequirement ? `用户需求：${originalRequirement}` : "",
        ...briefParts,
        "",
        "⚠️ 请务必使用上述关键词调用 searchNotes 和 webSearch 工具进行搜索。",
        "  - searchNotes 的 query 参数应填写与主题相关的中文关键词",
        "  - webSearch 的 query 参数应填写具体的搜索词（如「主题关键词 核心价值」）",
        "  - 不要使用空字符串或无关词汇作为搜索 query",
      ].filter(Boolean).join("\n")
    : "";

  console.log("[researchEvidenceNode] briefHint:", briefHint.slice(0, 200));

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...(briefHint ? [new HumanMessage(briefHint)] : []),
    ...safeSliceMessages(compressed.messages, 10),
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  const evidencePack = parseEvidencePack(content);

  return {
    messages: [response],
    currentAgent: "research_evidence_agent" as AgentType,
    researchComplete: evidencePack.items.length > 0,
    evidenceComplete: evidencePack.items.length > 0,
    evidencePack,
    summary: compressed.summary,
    lastError: null,
  };
}
