import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  AgentState,
  type AgentType,
  type BodyBlock,
  type ImagePlan,
  type LayoutSpec,
  type TextOverlayPlan,
} from "../state/agentState";
import { compressContext, safeSliceMessages, formatSupervisorGuidance } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { requestAgentClarification } from "../utils/agentClarification";

interface PlannerOutput {
  bodyBlocks: BodyBlock[];
  imagePlans: ImagePlan[];
  textOverlayPlan: TextOverlayPlan[];
}

function fallbackSplitBody(body: string): BodyBlock[] {
  const blocks = body
    .split(/\n\s*\n+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (blocks.length === 0) {
    return [
      {
        id: "p1",
        text: body.trim(),
        intent: "主信息",
        keywords: [],
      },
    ];
  }

  return blocks.map((text, idx) => ({
    id: `p${idx + 1}`,
    text,
    intent: idx === 0 ? "开场" : idx === blocks.length - 1 ? "收束" : "展开",
    keywords: text
      .replace(/[\n，。！？、；：]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 5),
  }));
}

function defaultLayoutSpec(count: number): LayoutSpec[] {
  const total = Math.max(1, Math.min(4, count || 3));
  const specs: LayoutSpec[] = [];
  for (let i = 0; i < total; i++) {
    specs.push({
      imageSeq: i,
      role: i === 0 ? "cover" : i === total - 1 ? "result" : "detail",
      visualFocus: i === 0 ? "主题视觉" : `段落重点 ${i}`,
      textDensity: i === 0 ? "低" : "中",
      blocks: [
        { area: "title", instruction: i === 0 ? "主标题突出" : "小标题概括本段" },
        { area: "body", instruction: "正文信息清楚、避免过长" },
        { area: "visual_focus", instruction: "视觉主体突出，背景简洁" },
      ],
    });
  }
  return specs;
}

function parsePlannerOutput(content: string): PlannerOutput | null {
  const extractJson = () => {
    const code = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (code) return code[1];
    const obj = content.match(/\{[\s\S]*\}/);
    if (obj) return obj[0];
    return null;
  };

  try {
    const raw = extractJson();
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const bodyBlocks: BodyBlock[] = Array.isArray(parsed.bodyBlocks)
      ? parsed.bodyBlocks
          .map((item: any, idx: number) => ({
            id: item.id || `p${idx + 1}`,
            text: String(item.text || "").trim(),
            intent: item.intent || "展开",
            keywords: Array.isArray(item.keywords) ? item.keywords.map((v: unknown) => String(v)) : [],
          }))
          .filter((item: BodyBlock) => item.text)
      : [];

    const imagePlans: ImagePlan[] = Array.isArray(parsed.imagePlans)
      ? parsed.imagePlans
          .map((item: any, idx: number) => ({
            sequence: Number.isFinite(item.sequence) ? item.sequence : idx,
            role: item.role || (idx === 0 ? "cover" : "detail"),
            description: item.description || `图 ${idx + 1}`,
            prompt: item.prompt || "",
          }))
          .slice(0, 4)
      : [];

    const textOverlayPlan: TextOverlayPlan[] = Array.isArray(parsed.textOverlayPlan)
      ? parsed.textOverlayPlan.map((item: any, idx: number) => ({
          imageSeq: Number.isFinite(item.imageSeq) ? item.imageSeq : idx,
          titleText: item.titleText ? String(item.titleText) : undefined,
          bodyText: item.bodyText ? String(item.bodyText) : undefined,
          placement: ["top", "center", "bottom"].includes(item.placement) ? item.placement : "top",
        }))
      : [];

    if (imagePlans.length === 0) {
      return null;
    }

    return {
      bodyBlocks,
      imagePlans,
      textOverlayPlan,
    };
  } catch {
    return null;
  }
}

function buildFallbackOutput(
  title: string,
  body: string,
  layoutSpec: LayoutSpec[],
  reviewSuggestions: string
): PlannerOutput {
  const bodyBlocks = fallbackSplitBody(body);
  const plans: ImagePlan[] = layoutSpec.map((layout, idx) => {
    const block = bodyBlocks[Math.min(idx, bodyBlocks.length - 1)];
    const overlayTitle = idx === 0 ? title : `${idx + 1}. ${block.intent}`;
    const prompt =
      `小红书图文配图，角色=${layout.role}，视觉重点=${layout.visualFocus}。` +
      `标题"${overlayTitle}"，正文重点"${block.text.slice(0, 60)}"。` +
      `文字密度=${layout.textDensity}，版块要求=${layout.blocks.map((b) => `${b.area}:${b.instruction}`).join(" | ")}` +
      (reviewSuggestions ? `，审核优化：${reviewSuggestions}` : "");

    return {
      sequence: layout.imageSeq,
      role: layout.role,
      description: `映射段落 ${block.id}`,
      prompt,
    };
  });

  const overlay: TextOverlayPlan[] = plans.map((plan, idx) => {
    const block = bodyBlocks[Math.min(idx, bodyBlocks.length - 1)];
    return {
      imageSeq: plan.sequence,
      titleText: idx === 0 ? title : `${idx + 1}`,
      bodyText: block.text.slice(0, 28),
      placement: idx === 0 ? "top" : "center",
    };
  });

  return {
    bodyBlocks,
    imagePlans: plans,
    textOverlayPlan: overlay,
  };
}

export async function imagePlannerNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const generated = state.generatedContent;
  const title = generated?.title || "AI 生成内容";
  const body = generated?.body || "";

  if (!body.trim()) {
    const errorMessage = new AIMessage(
      "图片规划失败：缺少正文内容。image_planner 必须收到完整正文后才能进行 AI 拆分与段落映射。"
    );

    return {
      messages: [errorMessage],
      currentAgent: "image_planner_agent" as AgentType,
      imagePlans: [],
      textOverlayPlan: [],
      bodyBlocks: [],
      layoutComplete: false,
      lastError: "MISSING_BODY_FOR_IMAGE_PLANNER",
    };
  }

  const needImagePlannerClarification = state.layoutSpec.length === 0;
  if (needImagePlannerClarification) {
    const clarificationResult = requestAgentClarification(state, {
      key: "image_planner_agent.visual_strategy",
      agent: "image_planner_agent",
      question: "还没有明确版式，你希望图片规划更偏向哪种策略？",
      options: [
        { id: "story_based", label: "按段落叙事", description: "每段对应一张图，图文映射最强" },
        { id: "highlight_based", label: "按重点提炼", description: "围绕核心卖点设计少量高价值图" },
        { id: "continue_default", label: "按默认策略", description: "系统自动平衡图文信息" },
      ],
      selectionType: "single",
      allowCustomInput: true,
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "image_planner_agent" as AgentType,
        imagePlans: [],
        textOverlayPlan: [],
        bodyBlocks: [],
      };
    }
  }

  const compressed = await compressContext(state, model);

  const supervisorGuidance = formatSupervisorGuidance(state, "image_planner_agent");

  const layoutSpec = state.layoutSpec.length > 0 ? state.layoutSpec : defaultLayoutSpec(3);
  const reviewSuggestions = state.reviewFeedback?.suggestions?.join("\n") || "";

  const promptFromStore = await getAgentPrompt("image_planner_agent", {
    reviewSuggestions,
  });

  const fallbackSystemPrompt = `你是图文配图规划专家。你必须先对正文做语义拆分，再规划每张图。
输出严格 JSON 对象：
{
  "bodyBlocks": [{"id":"p1","text":"...","intent":"...","keywords":["..."]}],
  "imagePlans": [{"sequence":0,"role":"cover","description":"...","prompt":"..."}],
  "textOverlayPlan": [{"imageSeq":0,"titleText":"...","bodyText":"...","placement":"top"}]
}
规则：
1) 正文不长，直接基于完整正文拆分，不要只看标题。
2) prompt 要包含可展示的文字，文字内容请加引号。
3) 只输出 JSON，不要多余解释。`;

  const response = await model.invoke([
    new HumanMessage(promptFromStore || fallbackSystemPrompt),
    ...(supervisorGuidance ? [new HumanMessage(supervisorGuidance)] : []),
    new HumanMessage(
      `标题：${title}\n\n完整正文：\n${body}\n\nlayoutSpec：${JSON.stringify(layoutSpec)}\n\nreferenceAnalyses：${JSON.stringify(state.referenceAnalyses)}\n\nreviewSuggestions：${reviewSuggestions || "无"}`
    ),
    ...safeSliceMessages(compressed.messages, 8),
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  const parsed = parsePlannerOutput(content);
  const output = parsed || buildFallbackOutput(title, body, layoutSpec, reviewSuggestions);

  const summaryPayload = {
    imagePlans: output.imagePlans,
    textOverlayPlan: output.textOverlayPlan,
    bodyBlocks: output.bodyBlocks,
  };

  const summaryMessage = new AIMessage(
    `图片规划完成\n\n共规划 ${output.imagePlans.length} 张图片。\n\n\`\`\`json\n${JSON.stringify(summaryPayload, null, 2)}\n\`\`\``
  );

  return {
    messages: [summaryMessage],
    currentAgent: "image_planner_agent" as AgentType,
    imagePlans: output.imagePlans,
    textOverlayPlan: output.textOverlayPlan,
    bodyBlocks: output.bodyBlocks,
    reviewFeedback: null,
    imagesComplete: false,
    summary: compressed.summary,
    lastError: null,
  };
}
