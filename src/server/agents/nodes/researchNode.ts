import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type EvidencePack } from "../state/agentState";
import { compressContext, safeSliceMessages, formatSupervisorGuidance } from "../utils";
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

// 从工具结果中提取 evidencePack（当 LLM 没有输出 JSON 时的 fallback）
function extractEvidenceFromToolResults(messages: any[]): EvidencePack {
  const toolResults: Array<{ fact: string; source?: string }> = [];

  for (const msg of messages) {
    if (msg instanceof ToolMessage || msg.constructor?.name === "ToolMessage") {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (!content || content.length < 30) continue;

      // 尝试解析 JSON 格式的工具结果
      try {
        const parsed = JSON.parse(content);

        // webSearch 结果格式
        if (parsed.results && Array.isArray(parsed.results)) {
          for (const r of parsed.results.slice(0, 3)) {
            if (r.content || r.title) {
              toolResults.push({
                fact: (r.content || r.title || "").slice(0, 200),
                source: r.url || r.title,
              });
            }
          }
          // 如果有 answer 字段，也提取
          if (parsed.answer && typeof parsed.answer === "string") {
            toolResults.push({ fact: parsed.answer.slice(0, 200), source: "webSearch" });
          }
          continue;
        }

        // searchNotes 结果格式
        if (parsed.notes && Array.isArray(parsed.notes)) {
          for (const n of parsed.notes.slice(0, 3)) {
            if (n.title || n.desc) {
              toolResults.push({
                fact: `${n.title || ""}: ${(n.desc || "").slice(0, 150)}`,
                source: n.url || n.author,
              });
            }
          }
          continue;
        }

        // 其他 JSON 格式，尝试提取有意义的字段
        if (parsed.summary) {
          toolResults.push({ fact: String(parsed.summary).slice(0, 200) });
        }
        if (parsed.analysis) {
          toolResults.push({ fact: String(parsed.analysis).slice(0, 200) });
        }
      } catch {
        // 非 JSON 格式，按行提取
        const lines = content
          .split(/\n+/)
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 30 && !line.startsWith("{") && !line.startsWith("["))
          .slice(0, 3);

        for (const line of lines) {
          toolResults.push({ fact: line.slice(0, 200) });
        }
      }
    }
  }

  if (toolResults.length === 0) {
    return { items: [], summary: "未提取到研究证据" };
  }

  // 去重
  const seen = new Set<string>();
  const uniqueResults = toolResults.filter((r) => {
    const key = r.fact.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    items: uniqueResults.slice(0, 8).map((r) => ({ fact: r.fact, source: r.source })),
    summary: `从搜索结果中提取了 ${Math.min(uniqueResults.length, 8)} 条信息`,
  };
}

export async function researchNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const briefKeywords = state.creativeBrief?.keywords || [];
  const needEvidenceDirection = briefKeywords.length < 2 && !state.evidenceComplete;
  if (needEvidenceDirection) {
    const clarificationResult = requestAgentClarification(state, {
      key: "research_agent.focus",
      agent: "research_agent",
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
        briefKeywords,
      },
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "research_agent" as AgentType,
        researchComplete: false,
        evidenceComplete: false,
      };
    }
  }

  const modelWithTools = model.bindTools(researchTools);
  const compressed = await compressContext(state, model);

  const supervisorGuidance = formatSupervisorGuidance(state, "research_agent");

  const promptFromStore = await getAgentPrompt("research_agent");
  const systemPrompt =
    promptFromStore ||
    `你是研究证据提炼专家。\n\n最后必须输出 JSON：\n{\n  "summary": "研究摘要",\n  "items": [\n    {"fact": "可验证结论", "source": "来源", "quote": "可选引用"}\n  ]\n}`;

  // 构建 Brief 上下文提示，确保 LLM 知道要搜索什么
  const brief = state.creativeBrief;
  const briefParts: string[] = [];
  if (brief) {
    if (brief.topic) briefParts.push(`主题：${brief.topic}`);
    if (brief.keywords?.length) briefParts.push(`关键词：${brief.keywords.join("、")}`);
    if (brief.constraints?.length) briefParts.push(`约束：${brief.constraints.join("；")}`);
    if (brief.audience) briefParts.push(`目标受众：${brief.audience}`);
    if (brief.goal) briefParts.push(`创作目标：${brief.goal}`);
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

  console.log("[researchNode] briefHint:", briefHint.slice(0, 200));

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...(supervisorGuidance ? [new HumanMessage(supervisorGuidance)] : []),
    ...(briefHint ? [new HumanMessage(briefHint)] : []),
    ...safeSliceMessages(compressed.messages, 10),
  ]);

  // 打印 LLM 原始返回
  const hasToolCalls = response instanceof AIMessage && response.tool_calls?.length > 0;
  console.log("[researchNode] LLM 返回:", {
    hasToolCalls,
    toolCallsCount: hasToolCalls ? (response as AIMessage).tool_calls?.length : 0,
    contentLength: typeof response.content === "string" ? response.content.length : 0,
    contentPreview: typeof response.content === "string" ? response.content.slice(0, 200) : "",
  });

  const content = typeof response.content === "string" ? response.content : "";
  let evidencePack = parseEvidencePack(content);

  // 如果 LLM 没有输出有效的 JSON evidencePack，尝试从已有的工具结果中提取
  // 这包括：LLM 返回 tool_calls、LLM 返回空内容、或 JSON 解析失败的情况
  if (evidencePack.items.length === 0) {
    const fallbackPack = extractEvidenceFromToolResults(state.messages || []);
    if (fallbackPack.items.length > 0) {
      console.log("[researchNode] 使用工具结果 fallback，提取了", fallbackPack.items.length, "条证据");
      evidencePack = fallbackPack;
    }
  }

  return {
    messages: [response],
    currentAgent: "research_agent" as AgentType,
    researchComplete: evidencePack.items.length > 0,
    evidenceComplete: evidencePack.items.length > 0,
    evidencePack,
    summary: compressed.summary,
    lastError: null,
  };
}
