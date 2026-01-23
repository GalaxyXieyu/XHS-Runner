import { AIMessage } from "@langchain/core/messages";
import { AgentState, type AgentType } from "../state/agentState";
import { analyzeReferenceImage } from "../../services/xhs/llm/geminiClient";

export async function styleAnalyzerNode(state: typeof AgentState.State) {
  if (!state.referenceImageUrl) {
    throw new Error("没有参考图 URL");
  }

  const styleAnalysis = await analyzeReferenceImage(state.referenceImageUrl);

  const summaryMessage = new AIMessage(
    `风格分析完成！\n\n` +
    `风格类型: ${styleAnalysis.style}\n` +
    `主色调: ${styleAnalysis.colorPalette.join(", ")}\n` +
    `氛围: ${styleAnalysis.mood}\n` +
    `构图: ${styleAnalysis.composition || styleAnalysis.layout || "未识别"}\n` +
    `布局: ${styleAnalysis.layout || "未识别"}\n` +
    `光线: ${styleAnalysis.lighting}\n` +
    `文字密度: ${styleAnalysis.textDensity || "未识别"}\n` +
    `关键元素: ${(styleAnalysis.elementaryComponents || []).join(", ")}\n` +
    `风格描述: ${styleAnalysis.description}`
  );

  return {
    messages: [summaryMessage],
    currentAgent: "style_analyzer_agent" as AgentType,
    styleAnalysis,
  };
}
