import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type LayoutSpec } from "../state/agentState";
import { compressContext, safeSliceMessages, formatSupervisorGuidance } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { requestAgentClarification } from "../utils/agentClarification";

function defaultLayoutSpec(total: number): LayoutSpec[] {
  const count = Math.max(1, Math.min(4, total || 3));
  const specs: LayoutSpec[] = [];
  for (let i = 0; i < count; i++) {
    const role = i === 0 ? "cover" : i === count - 1 ? "result" : "detail";
    specs.push({
      imageSeq: i,
      role,
      visualFocus: i === 0 ? "主题封面" : `正文重点 ${i}`,
      textDensity: i === 0 ? "低" : "中",
      blocks: [
        { area: "title", instruction: i === 0 ? "主标题置顶，突出主题" : "小标题点明本图重点" },
        { area: "body", instruction: "正文信息分 2-3 行，避免堆字" },
        { area: "visual_focus", instruction: "保留明显视觉焦点，避免背景杂乱" },
      ],
    });
  }
  return specs;
}

function parseLayoutSpec(content: string): LayoutSpec[] {
  const extractJson = () => {
    const code = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (code) return code[1];
    const arr = content.match(/\[[\s\S]*\]/);
    if (arr) return arr[0];
    const obj = content.match(/\{[\s\S]*\}/);
    if (obj) return obj[0];
    return null;
  };

  try {
    const raw = extractJson();
    if (!raw) return [];
    const parsed = JSON.parse(raw);

    // Legacy schema: array of layoutSpec objects.
    if (Array.isArray(parsed)) {
      return parsed
        .map((item: any, idx: number) => ({
          imageSeq: Number.isFinite(item.imageSeq) ? item.imageSeq : idx,
          role: item.role || (idx === 0 ? "cover" : "detail"),
          visualFocus: item.visualFocus || "正文重点",
          textDensity: item.textDensity || "中",
          blocks: Array.isArray(item.blocks)
            ? item.blocks
                .map((b: any) => ({
                  area: b.area || "body",
                  instruction: b.instruction || "信息清晰可读",
                }))
                .slice(0, 6)
            : [
                { area: "title", instruction: "标题简洁" },
                { area: "body", instruction: "正文重点清晰" },
              ],
        }))
        .slice(0, 4);
    }

    // New schema (2026-02-12): { blocks: [{type, desc}], totalImages }
    if (parsed && typeof parsed === "object") {
      const totalImages = Number.isFinite(parsed.totalImages) ? Number(parsed.totalImages) : 0;
      const count = Math.max(1, Math.min(4, totalImages || 3));

      const blocksRaw = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      const coverDesc = blocksRaw.find((b: any) => b && b.type === "cover" && typeof b.desc === "string")?.desc;

      const baseBlocks = [
        { area: "title" as const, instruction: coverDesc ? `封面重点：${String(coverDesc).slice(0, 40)}` : "主标题突出" },
        { area: "body" as const, instruction: "正文分层清晰，避免堆字" },
        { area: "visual_focus" as const, instruction: "图像与正文主题一致，背景简洁" },
      ];

      const specs: LayoutSpec[] = [];
      for (let i = 0; i < count; i++) {
        const role = i === 0 ? "cover" : i === count - 1 ? "result" : "detail";
        specs.push({
          imageSeq: i,
          role,
          visualFocus: i === 0 ? (coverDesc || "主题封面") : `正文重点 ${i}`,
          textDensity: i === 0 ? "低" : "中",
          blocks: baseBlocks,
        });
      }
      return specs;
    }

    return [];
  } catch {
    return [];
  }
}

export async function layoutPlannerNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const compressed = await compressContext(state, model);

  const supervisorGuidance = formatSupervisorGuidance(state, "layout_planner_agent");

  const generated = state.generatedContent;
  const body = generated?.body || "";
  const title = generated?.title || "";

  if (!body.trim()) {
    return {
      messages: [new AIMessage("缺少正文，无法规划版式，回退写作节点")],
      currentAgent: "layout_planner_agent" as AgentType,
      layoutComplete: false,
      lastError: "MISSING_BODY_FOR_LAYOUT",
    };
  }

  const needLayoutPreferenceClarification =
    !state.layoutComplete
    && state.layoutPreference === "balanced"
    && state.referenceAnalyses.length === 0;

  if (needLayoutPreferenceClarification) {
    const clarificationResult = requestAgentClarification(state, {
      key: "layout_planner_agent.preference",
      agent: "layout_planner_agent",
      question: "排版阶段你更偏好哪种图文密度？",
      options: [
        { id: "dense", label: "信息密集", description: "每张图承载更多信息，偏干货" },
        { id: "balanced", label: "均衡", description: "信息与视觉平衡，通用场景" },
        { id: "visual_first", label: "视觉优先", description: "更强调画面，文字更精炼" },
      ],
      selectionType: "single",
      allowCustomInput: true,
      context: {
        currentLayoutPreference: state.layoutPreference,
      },
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "layout_planner_agent" as AgentType,
        layoutComplete: false,
      };
    }
  }

  const promptFromStore = await getAgentPrompt("layout_planner_agent");
  const systemPrompt = promptFromStore || `你是小红书图文版式规划专家。
请根据标题、正文、风格参数输出 JSON 数组（最多4个 layoutSpec）：
[
  {
    "imageSeq": 0,
    "role": "cover|detail|result",
    "visualFocus": "本图视觉焦点",
    "textDensity": "低|中|高",
    "blocks": [
      {"area": "title", "instruction": "标题区要求"},
      {"area": "body", "instruction": "正文区要求"},
      {"area": "visual_focus", "instruction": "视觉焦点要求"}
    ]
  }
]`;

  const styleHint = state.styleAnalysis
    ? `风格：${state.styleAnalysis.mood} / ${state.styleAnalysis.colorPalette.join("、")} / ${state.styleAnalysis.lighting}`
    : "风格：默认小红书图文卡片";

  const response = await model.invoke([
    new HumanMessage(systemPrompt),
    ...(supervisorGuidance ? [new HumanMessage(supervisorGuidance)] : []),
    new HumanMessage(`标题：${title}\n\n正文：${body}\n\n${styleHint}\n\nlayoutPreference: ${state.layoutPreference}`),
    ...safeSliceMessages(compressed.messages, 6),
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  let layoutSpec = parseLayoutSpec(content);

  if (layoutSpec.length === 0) {
    layoutSpec = defaultLayoutSpec(state.imagePlans.length || 3);
  }

  const summaryMessage = new AIMessage(
    `版式规划完成：共 ${layoutSpec.length} 张，偏好=${state.layoutPreference}`
  );

  return {
    messages: [summaryMessage],
    currentAgent: "layout_planner_agent" as AgentType,
    layoutSpec,
    layoutComplete: layoutSpec.length > 0,
    summary: compressed.summary,
    lastError: null,
  };
}
