import { AIMessage } from "@langchain/core/messages";
import {
  AgentState,
  type AgentType,
  type ReferenceAnalysis,
  type ReferenceAnalysisType,
  type ReferenceInput,
  type StyleAnalysis,
} from "../state/agentState";
import { analyzeReferenceImage } from "../../services/xhs/llm/geminiClient";

function classifyReferenceType(
  inputType: ReferenceInput["type"],
  analysis: StyleAnalysis
): { type: ReferenceAnalysisType; confidence: number } {
  if (inputType === "style") {
    return { type: "style_ref", confidence: 0.95 };
  }
  if (inputType === "layout") {
    return { type: "layout_ref", confidence: 0.95 };
  }
  if (inputType === "content") {
    return { type: "content_ref", confidence: 0.95 };
  }

  const desc = (analysis.description || "").toLowerCase();
  const hasLayoutHint = /layout|构图|版式|排版|文字密度|grid|collage/.test(desc);
  const hasContentHint = /产品|人物|场景|物体|使用|产品图|实拍|细节/.test(desc);
  const hasStyleHint = /色调|氛围|风格|质感|lighting|mood|style/.test(desc);

  if (hasLayoutHint && !hasContentHint) {
    return { type: "layout_ref", confidence: 0.78 };
  }
  if (hasContentHint && !hasStyleHint) {
    return { type: "content_ref", confidence: 0.78 };
  }
  if (hasStyleHint && !hasContentHint) {
    return { type: "style_ref", confidence: 0.78 };
  }
  return { type: "mixed_ref", confidence: 0.65 };
}

function mergeStyleAnalysis(analyses: ReferenceAnalysis[]): StyleAnalysis | null {
  const styleRefs = analyses.filter((item) => item.type === "style_ref" || item.type === "mixed_ref");
  if (styleRefs.length === 0) return null;

  const paletteSet = new Set<string>();
  const moodSet = new Set<string>();
  const lightingSet = new Set<string>();
  const layoutSet = new Set<string>();
  const componentsSet = new Set<string>();

  for (const item of styleRefs) {
    item.styleTokens.colorPalette.forEach((v) => paletteSet.add(v));
    if (item.styleTokens.mood) moodSet.add(item.styleTokens.mood);
    if (item.styleTokens.lighting) lightingSet.add(item.styleTokens.lighting);
    if (item.layoutTokens.layout) layoutSet.add(item.layoutTokens.layout);
    item.contentTokens.elements.forEach((v) => componentsSet.add(v));
  }

  return {
    style: "reference-fused",
    colorPalette: Array.from(paletteSet),
    mood: Array.from(moodSet).join(" + ") || "自然",
    composition: Array.from(layoutSet).join(" + ") || "竖版图文",
    lighting: Array.from(lightingSet).join(" + ") || "柔和",
    texture: "clean",
    layout: Array.from(layoutSet).join(" + ") || "图文卡片",
    textDensity: "适中",
    elementaryComponents: Array.from(componentsSet),
    description: "基于参考图融合的风格参数",
  };
}

export async function referenceIntelligenceNode(state: typeof AgentState.State) {
  const inputs: ReferenceInput[] = state.referenceInputs.length > 0
    ? state.referenceInputs
    : (state.referenceImages || []).map((url) => ({ url } as ReferenceInput));

  if (inputs.length === 0) {
    return {
      currentAgent: "reference_intelligence_agent" as AgentType,
      referenceIntelligenceComplete: true,
      referenceAnalyses: [],
      lastError: null,
    };
  }

  const analyses: ReferenceAnalysis[] = [];

  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index];
    try {
      const style = await analyzeReferenceImage(input.url);
      const typeResult = classifyReferenceType(input.type, style);
      analyses.push({
        index,
        url: input.url,
        type: typeResult.type,
        confidence: typeResult.confidence,
        styleTokens: {
          colorPalette: style.colorPalette || [],
          mood: style.mood || "",
          lighting: style.lighting || "",
          styleKeywords: [style.style].filter(Boolean),
        },
        layoutTokens: {
          layout: style.layout || style.composition || "",
          textDensity: style.textDensity || "适中",
          composition: style.composition || "",
        },
        contentTokens: {
          elements: style.elementaryComponents || [],
          scene: style.description || "",
        },
        rawAnalysis: style.description || "",
      });
    } catch (error) {
      analyses.push({
        index,
        url: input.url,
        type: "mixed_ref",
        confidence: 0.5,
        styleTokens: {
          colorPalette: [],
          mood: "",
          lighting: "",
          styleKeywords: [],
        },
        layoutTokens: {
          layout: "",
          textDensity: "适中",
          composition: "",
        },
        contentTokens: {
          elements: [],
          scene: "",
        },
        rawAnalysis: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const styleAnalysis = mergeStyleAnalysis(analyses);
  const summary = analyses
    .map((item) => `#${item.index + 1} ${item.type}(${item.confidence.toFixed(2)})`)
    .join("；");

  return {
    messages: [new AIMessage(`参考图智能分流完成：${summary}`)],
    currentAgent: "reference_intelligence_agent" as AgentType,
    referenceIntelligenceComplete: true,
    referenceAnalyses: analyses,
    styleAnalysis,
    lastError: null,
  };
}
