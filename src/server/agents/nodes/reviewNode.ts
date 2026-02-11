import { HumanMessage } from "@langchain/core/messages";
import * as fs from "fs";
import { AgentState, type AgentType, type ReviewFeedback, type QualityDimensionScores, type QualityScores } from "../state/agentState";
import { safeSliceMessages, createLLM, formatSupervisorGuidance } from "../utils";
import { REVIEW_THRESHOLDS, buildReviewThresholdHint } from "../utils/reviewThresholds";
import { getAgentPrompt } from "../../services/promptManager";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { requestAgentClarification } from "../utils/agentClarification";
import { loadStorageConfig } from "../../services/storage/config";
import { StorageService } from "../../services/storage/StorageService";

const THRESHOLDS = REVIEW_THRESHOLDS;

const REQUIRE_MODEL_APPROVAL = process.env.REVIEW_REQUIRE_MODEL_APPROVAL
  ? process.env.REVIEW_REQUIRE_MODEL_APPROVAL === "true"
  : process.env.NODE_ENV === "production";

function average(scores: QualityDimensionScores): number {
  const values = Object.values(scores);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function normalizeUnitScore(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;

  // 兼容模型输出 0-100 百分制
  if (num > 1 && num <= 100) {
    return Math.max(0, Math.min(1, num / 100));
  }

  return Math.max(0, Math.min(1, num));
}

function buildFailReasons(scores: QualityDimensionScores, overall: number): string[] {
  const failReasons: string[] = [];
  if (scores.infoDensity < THRESHOLDS.infoDensity) failReasons.push("信息密度不足");
  if (scores.textImageAlignment < THRESHOLDS.textImageAlignment) failReasons.push("图文映射不足");
  if (scores.styleConsistency < THRESHOLDS.styleConsistency) failReasons.push("风格一致性不足");
  if (scores.readability < THRESHOLDS.readability) failReasons.push("文字可读性不足");
  if (scores.platformFit < THRESHOLDS.platformFit) failReasons.push("平台适配不足");
  if (overall < THRESHOLDS.overall) failReasons.push("综合评分未达标");
  return failReasons;
}

function meetsThresholds(scores: QualityDimensionScores, overall: number): boolean {
  return (
    scores.infoDensity >= THRESHOLDS.infoDensity &&
    scores.textImageAlignment >= THRESHOLDS.textImageAlignment &&
    scores.styleConsistency >= THRESHOLDS.styleConsistency &&
    scores.readability >= THRESHOLDS.readability &&
    scores.platformFit >= THRESHOLDS.platformFit &&
    overall >= THRESHOLDS.overall
  );
}

function fallbackScore(state: typeof AgentState.State): QualityScores {
  const body = state.generatedContent?.body || "";
  const infoDensity = Math.min(0.9, Math.max(0.45, body.length / 700));
  const textImageAlignment = state.imagePlans.length > 0
    ? Math.min(0.9, state.generatedImageAssetIds.length / state.imagePlans.length)
    : 0.4;
  const styleConsistency = state.referenceAnalyses.length > 0 ? 0.78 : 0.68;
  const readability = state.textOverlayPlan.length > 0 ? 0.75 : 0.66;
  const platformFit = state.imagePlans.length <= 4 ? 0.78 : 0.62;

  const scores: QualityDimensionScores = {
    infoDensity,
    textImageAlignment,
    styleConsistency,
    readability,
    platformFit,
  };

  return {
    scores,
    overall: average(scores),
    failReasons: buildFailReasons(scores, average(scores)),
  };
}

function parseReviewResult(content: string): {
  feedback: ReviewFeedback;
  qualityScores: QualityScores;
} | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const scores: QualityDimensionScores = {
      infoDensity: normalizeUnitScore(parsed?.scores?.infoDensity),
      textImageAlignment: normalizeUnitScore(parsed?.scores?.textImageAlignment),
      styleConsistency: normalizeUnitScore(parsed?.scores?.styleConsistency),
      readability: normalizeUnitScore(parsed?.scores?.readability),
      platformFit: normalizeUnitScore(parsed?.scores?.platformFit),
    };

    const overallFromModel = normalizeUnitScore(parsed?.overall);
    const overall = overallFromModel > 0 ? overallFromModel : average(scores);

    const modelFailReasons = Array.isArray(parsed.failReasons)
      ? parsed.failReasons.map((v: unknown) => String(v)).slice(0, 8)
      : [];

    const thresholdFailReasons = buildFailReasons(scores, overall);
    const failReasons = Array.from(new Set([...thresholdFailReasons, ...modelFailReasons])).slice(0, 8);

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((v: unknown) => String(v)).slice(0, 8)
      : [];

    const approvedByThreshold = meetsThresholds(scores, overall);
    // 调试期可通过 REVIEW_REQUIRE_MODEL_APPROVAL=false 关闭模型 veto。
    const approved = approvedByThreshold && (!REQUIRE_MODEL_APPROVAL || parsed.approved !== false);

    const feedback: ReviewFeedback = {
      approved,
      suggestions,
      targetAgent: typeof parsed.rerouteTarget === "string" ? parsed.rerouteTarget : undefined,
      scores,
      overall,
      rerouteTarget: typeof parsed.rerouteTarget === "string" ? parsed.rerouteTarget : undefined,
    };

    const qualityScores: QualityScores = {
      scores,
      overall,
      failReasons,
    };

    return {
      feedback,
      qualityScores,
    };
  } catch {
    return null;
  }
}

function decideRerouteTarget(scores: QualityDimensionScores): AgentType {
  if (scores.infoDensity < THRESHOLDS.infoDensity) return "research_evidence_agent";
  if (scores.textImageAlignment < THRESHOLDS.textImageAlignment) return "layout_planner_agent";
  if (scores.styleConsistency < THRESHOLDS.styleConsistency) return "reference_intelligence_agent";
  if (scores.readability < THRESHOLDS.readability) return "image_planner_agent";
  if (scores.platformFit < THRESHOLDS.platformFit) return "writer_agent";
  return "image_planner_agent";
}

function guessImageMimeType(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export async function reviewAgentNode(state: typeof AgentState.State) {
  const visionModel = await createLLM(true);

  const imageContents: Array<{ type: "image_url"; image_url: { url: string } }> = [];
  const imageAssetIds: number[] = [];
  const seenAssetIds = new Set<number>();

  const pushAssetId = (id: number) => {
    if (!Number.isFinite(id) || seenAssetIds.has(id)) return;
    seenAssetIds.add(id);
    imageAssetIds.push(id);
  };

  if (Array.isArray(state.generatedImageAssetIds)) {
    state.generatedImageAssetIds.forEach(pushAssetId);
  }

  if (Array.isArray(state.generatedImagePaths)) {
    state.generatedImagePaths.forEach((path) => {
      const match = typeof path === "string" ? path.match(/\/api\/assets\/(\d+)/) : null;
      if (match) {
        pushAssetId(Number(match[1]));
      }
    });
  }

  const recentAssetIds = imageAssetIds.slice(-4);
  if (recentAssetIds.length > 0) {
    try {
      const storageConfig = await loadStorageConfig();
      const storageService = StorageService.reinitialize(storageConfig);
      const assets = await db
        .select({ id: schema.assets.id, path: schema.assets.path })
        .from(schema.assets)
        .where(inArray(schema.assets.id, recentAssetIds));

      const assetPathMap = new Map(assets.map((asset) => [asset.id, asset.path]));
      for (const assetId of recentAssetIds) {
        const assetPath = assetPathMap.get(assetId);
        if (!assetPath) continue;
        try {
          const imageBuffer = await storageService.retrieve(assetPath);
          const base64 = imageBuffer.toString("base64");
          const mimeType = guessImageMimeType(assetPath);
          imageContents.push({
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          });
        } catch (e) {
          console.error(`[reviewAgentNode] Failed to load asset ${assetId}: ${assetPath}`, e);
        }
      }
    } catch (e) {
      console.error("[reviewAgentNode] Failed to load assets for review", e);
    }
  }

  if (imageContents.length === 0) {
    for (const imagePath of state.generatedImagePaths.slice(-4)) {
      if (!imagePath || typeof imagePath !== "string") continue;
      if (/\/api\/assets\/\d+/.test(imagePath)) continue;
      try {
        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          const base64 = imageBuffer.toString("base64");
          const mimeType = guessImageMimeType(imagePath);
          imageContents.push({
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          });
        }
      } catch (e) {
        console.error(`[reviewAgentNode] Failed to load image: ${imagePath}`, e);
      }
    }
  }

  const hasImages = imageContents.length > 0;

  if (!hasImages) {
    const clarificationResult = requestAgentClarification(state, {
      key: "review_agent.no_images",
      agent: "review_agent",
      question: "当前还没有生成图片，是否先进行文字向审核？",
      options: [
        { id: "text_only_review", label: "先做文字审核", description: "先看信息密度与可读性" },
        { id: "continue_default", label: "按默认继续", description: "系统自动判定当前结果" },
      ],
      selectionType: "single",
      allowCustomInput: true,
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "review_agent" as AgentType,
      };
    }
  }

  const stateVariables = {
    imagePlans: JSON.stringify(state.imagePlans),
    styleAnalysis: JSON.stringify(state.styleAnalysis),
    generatedImageCount: String(Math.max(state.generatedImagePaths.length, state.generatedImageAssetIds.length)),
    bodyBlocks: JSON.stringify(state.bodyBlocks),
    layoutSpec: JSON.stringify(state.layoutSpec),
    hasImages: hasImages ? "true" : "false",
  };

  const promptFromStore = await getAgentPrompt("review_agent", stateVariables);
  const systemPrompt = promptFromStore || `你是小红书图文质量审核专家。请按以下 JSON 输出：
{
  "scores": {
    "infoDensity": 0-1,
    "textImageAlignment": 0-1,
    "styleConsistency": 0-1,
    "readability": 0-1,
    "platformFit": 0-1
  },
  "overall": 0-1,
  "approved": true/false,
  "suggestions": ["优化建议"],
  "failReasons": ["不通过原因"],
  "rerouteTarget": "research_evidence_agent|layout_planner_agent|reference_intelligence_agent|writer_agent|image_planner_agent"
}`;

  const systemPromptWithThreshold = `${systemPrompt}\n\n${buildReviewThresholdHint(THRESHOLDS)}`;

  const supervisorGuidance = formatSupervisorGuidance(state, "review_agent");

  const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: systemPromptWithThreshold },
    ...(supervisorGuidance ? [{ type: "text", text: supervisorGuidance }] : []),
    { type: "text", text: `当前正文：${state.generatedContent?.body || ""}` },
    ...imageContents,
  ];

  const response = await visionModel.invoke([
    new HumanMessage({ content: messageContent }),
    ...safeSliceMessages(state.messages, 8),
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  const parsed = parseReviewResult(content);

  let feedback: ReviewFeedback;
  let qualityScores: QualityScores;

  if (parsed) {
    feedback = parsed.feedback;
    qualityScores = parsed.qualityScores;
  } else {
    qualityScores = fallbackScore(state);
    const approved = meetsThresholds(qualityScores.scores, qualityScores.overall);
    const suggestions = qualityScores.failReasons.map((reason) => `请优化：${reason}`);
    feedback = {
      approved,
      suggestions,
      targetAgent: approved ? undefined : decideRerouteTarget(qualityScores.scores),
      scores: qualityScores.scores,
      overall: qualityScores.overall,
      rerouteTarget: approved ? undefined : decideRerouteTarget(qualityScores.scores),
    };
  }

  if (!feedback.approved && !feedback.targetAgent) {
    feedback.targetAgent = decideRerouteTarget(qualityScores.scores);
  }

  recordReviewResult(feedback.approved).catch(console.error);

  const failReasonText = qualityScores.failReasons.length > 0
    ? qualityScores.failReasons.join("、")
    : "评分维度未达标";

  const reviewMessage = feedback.approved
    ? `审核通过\n\n综合评分 ${(qualityScores.overall * 100).toFixed(0)} 分，已满足上线阈值。\n图文映射与可读性达标，流程完成。`
    : `审核未通过\n\n综合评分 ${(qualityScores.overall * 100).toFixed(0)} 分，未通过阈值校验（${failReasonText}）。\n建议：\n${feedback.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n") || "1. 请根据低分维度优化"}`;

  const friendlyResponse = new HumanMessage(reviewMessage);

  return {
    messages: [friendlyResponse],
    currentAgent: "review_agent" as AgentType,
    reviewFeedback: feedback,
    qualityScores,
    iterationCount: state.iterationCount + 1,
  };
}

// 记录审核结果到系统统计
async function recordReviewResult(approved: boolean) {
  try {
    const [stats] = await db
      .select()
      .from(schema.promptProfiles)
      .where(eq(schema.promptProfiles.id, 1))
      .limit(1);

    if (stats) {
      await db
        .update(schema.promptProfiles)
        .set({
          [approved ? "successCount" : "failCount"]: approved
            ? sql`COALESCE(${schema.promptProfiles.successCount}, 0) + 1`
            : sql`COALESCE(${schema.promptProfiles.failCount}, 0) + 1`,
          lastUsedAt: new Date(),
        })
        .where(eq(schema.promptProfiles.id, 1));
    }
  } catch (e) {
    console.error("[reviewAgentNode] Failed to record review result:", e);
  }
}
