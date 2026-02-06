import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  AgentState,
  type AgentType,
  type BodyBlock,
  type ImagePlan,
  type LayoutSpec,
  type ParagraphImageBinding,
  type TextOverlayPlan,
} from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { askUserTool } from "../tools";

interface PlannerOutput {
  bodyBlocks: BodyBlock[];
  imagePlans: ImagePlan[];
  paragraphImageBindings: ParagraphImageBinding[];
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

    const bindings: ParagraphImageBinding[] = Array.isArray(parsed.paragraphImageBindings)
      ? parsed.paragraphImageBindings
          .map((item: any, idx: number) => ({
            imageSeq: Number.isFinite(item.imageSeq) ? item.imageSeq : idx,
            paragraphIds: Array.isArray(item.paragraphIds) ? item.paragraphIds.map((v: unknown) => String(v)) : [],
            rationale: item.rationale || "按语义映射",
          }))
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
      paragraphImageBindings: bindings,
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

  const bindings: ParagraphImageBinding[] = plans.map((plan, idx) => ({
    imageSeq: plan.sequence,
    paragraphIds: [bodyBlocks[Math.min(idx, bodyBlocks.length - 1)].id],
    rationale: "按正文段落语义顺序映射",
  }));

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
    paragraphImageBindings: bindings,
    textOverlayPlan: overlay,
  };
}

export async function imagePlannerNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const modelWithTools = model.bindTools([askUserTool]);
  const compressed = await compressContext(state, model);

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
      paragraphImageBindings: [],
      textOverlayPlan: [],
      bodyBlocks: [],
      layoutComplete: false,
      lastError: "MISSING_BODY_FOR_IMAGE_PLANNER",
    };
  }

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
  "paragraphImageBindings": [{"imageSeq":0,"paragraphIds":["p1"],"rationale":"..."}],
  "textOverlayPlan": [{"imageSeq":0,"titleText":"...","bodyText":"...","placement":"top"}]
}
规则：
1) 正文不长，直接基于完整正文拆分，不要只看标题。
2) 每张图必须绑定至少一个 paragraphIds。
3) prompt 要包含可展示的文字，文字内容请加引号。
4) 只输出 JSON，不要多余解释。`;

  const response = await modelWithTools.invoke([
    new HumanMessage(promptFromStore || fallbackSystemPrompt),
    new HumanMessage(
      `标题：${title}\n\n完整正文：\n${body}\n\nlayoutSpec：${JSON.stringify(layoutSpec)}\n\nreferenceAnalyses：${JSON.stringify(state.referenceAnalyses)}\n\nreviewSuggestions：${reviewSuggestions || "无"}`
    ),
    ...safeSliceMessages(compressed.messages, 8),
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  const parsed = parsePlannerOutput(content);
  const output = parsed || buildFallbackOutput(title, body, layoutSpec, reviewSuggestions);

  // 补齐绑定（防止模型遗漏）
  if (output.paragraphImageBindings.length < output.imagePlans.length) {
    const existingSeq = new Set(output.paragraphImageBindings.map((b) => b.imageSeq));
    output.imagePlans.forEach((plan, idx) => {
      if (!existingSeq.has(plan.sequence)) {
        const block = output.bodyBlocks[Math.min(idx, output.bodyBlocks.length - 1)];
        if (block) {
          output.paragraphImageBindings.push({
            imageSeq: plan.sequence,
            paragraphIds: [block.id],
            rationale: "自动补全段落映射",
          });
        }
      }
    });
  }

  const summaryPayload = {
    imagePlans: output.imagePlans,
    paragraphImageBindings: output.paragraphImageBindings,
    textOverlayPlan: output.textOverlayPlan,
    bodyBlocks: output.bodyBlocks,
  };

  const summaryMessage = new AIMessage(
    `图片规划完成\n\n共规划 ${output.imagePlans.length} 张图片，并完成段落映射 ${output.paragraphImageBindings.length} 条。\n\n\`\`\`json\n${JSON.stringify(summaryPayload, null, 2)}\n\`\`\``
  );

  return {
    messages: [summaryMessage],
    currentAgent: "image_planner_agent" as AgentType,
    imagePlans: output.imagePlans,
    paragraphImageBindings: output.paragraphImageBindings,
    textOverlayPlan: output.textOverlayPlan,
    bodyBlocks: output.bodyBlocks,
    reviewFeedback: null,
    imagesComplete: false,
    summary: compressed.summary,
    lastError: null,
  };
}
