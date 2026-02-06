import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type EvidencePack } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { researchTools } from "../tools";

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
  const modelWithTools = model.bindTools(researchTools);
  const compressed = await compressContext(state, model);

  const promptFromStore = await getAgentPrompt("research_evidence_agent");
  const legacyPrompt = await getAgentPrompt("research_agent");
  const systemPrompt =
    promptFromStore ||
    `${legacyPrompt || "你是研究专家。"}\n\n补充要求：最后必须输出 JSON：\n{\n  "summary": "研究摘要",\n  "items": [\n    {"fact": "可验证结论", "source": "来源", "quote": "可选引用"}\n  ]\n}`;

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
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
