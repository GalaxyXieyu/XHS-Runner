import { HumanMessage } from "@langchain/core/messages";
import * as fs from "fs";
import { AgentState, type AgentType, type ReviewFeedback, type QualityDimensionScores, type QualityScores } from "../state/agentState";
import { safeSliceMessages, createLLM } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

const THRESHOLDS = {
  infoDensity: 0.65,
  textImageAlignment: 0.7,
  styleConsistency: 0.65,
  readability: 0.7,
  platformFit: 0.65,
  overall: 0.72,
};

function average(scores: QualityDimensionScores): number {
  const values = Object.values(scores);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function fallbackScore(state: typeof AgentState.State): QualityScores {
  const body = state.generatedContent?.body || "";
  const infoDensity = Math.min(0.9, Math.max(0.45, body.length / 700));
  const textImageAlignment = state.imagePlans.length > 0
    ? Math.min(0.9, state.paragraphImageBindings.length / state.imagePlans.length)
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

  const failReasons: string[] = [];
  if (scores.infoDensity < THRESHOLDS.infoDensity) failReasons.push("信息密度不足");
  if (scores.textImageAlignment < THRESHOLDS.textImageAlignment) failReasons.push("图文映射不足");
  if (scores.styleConsistency < THRESHOLDS.styleConsistency) failReasons.push("风格一致性不足");
  if (scores.readability < THRESHOLDS.readability) failReasons.push("文字可读性不足");
  if (scores.platformFit < THRESHOLDS.platformFit) failReasons.push("平台适配不足");

  return {
    scores,
    overall: average(scores),
    failReasons,
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
      infoDensity: Number(parsed?.scores?.infoDensity ?? 0),
      textImageAlignment: Number(parsed?.scores?.textImageAlignment ?? 0),
      styleConsistency: Number(parsed?.scores?.styleConsistency ?? 0),
      readability: Number(parsed?.scores?.readability ?? 0),
      platformFit: Number(parsed?.scores?.platformFit ?? 0),
    };

    const normalized: QualityDimensionScores = {
      infoDensity: Math.max(0, Math.min(1, scores.infoDensity)),
      textImageAlignment: Math.max(0, Math.min(1, scores.textImageAlignment)),
      styleConsistency: Math.max(0, Math.min(1, scores.styleConsistency)),
      readability: Math.max(0, Math.min(1, scores.readability)),
      platformFit: Math.max(0, Math.min(1, scores.platformFit)),
    };

    const overall = Number.isFinite(parsed.overall)
      ? Math.max(0, Math.min(1, Number(parsed.overall)))
      : average(normalized);

    const failReasons = Array.isArray(parsed.failReasons)
      ? parsed.failReasons.map((v: unknown) => String(v)).slice(0, 8)
      : [];

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((v: unknown) => String(v)).slice(0, 8)
      : [];

    const approved = typeof parsed.approved === "boolean"
      ? parsed.approved
      : overall >= THRESHOLDS.overall;

    const feedback: ReviewFeedback = {
      approved,
      suggestions,
      targetAgent: typeof parsed.rerouteTarget === "string" ? parsed.rerouteTarget : undefined,
      scores: normalized,
      overall,
      rerouteTarget: parsed.rerouteTarget,
    };

    const qualityScores: QualityScores = {
      scores: normalized,
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

export async function reviewAgentNode(state: typeof AgentState.State) {
  const visionModel = await createLLM(true);

  const imageContents: Array<{ type: "image_url"; image_url: { url: string } }> = [];
  for (const imagePath of state.generatedImagePaths.slice(-4)) {
    try {
      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64 = imageBuffer.toString("base64");
        const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
        imageContents.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` },
        });
      }
    } catch (e) {
      console.error(`[reviewAgentNode] Failed to load image: ${imagePath}`, e);
    }
  }

  const hasImages = imageContents.length > 0;

  const stateVariables = {
    imagePlans: JSON.stringify(state.imagePlans),
    styleAnalysis: JSON.stringify(state.styleAnalysis),
    generatedImageCount: String(state.generatedImagePaths.length),
    bodyBlocks: JSON.stringify(state.bodyBlocks),
    paragraphImageBindings: JSON.stringify(state.paragraphImageBindings),
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

  const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: systemPrompt },
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
    const approved = qualityScores.overall >= THRESHOLDS.overall && qualityScores.failReasons.length === 0;
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

  const reviewMessage = feedback.approved
    ? `审核通过\n\n综合评分 ${(qualityScores.overall * 100).toFixed(0)} 分，已满足上线阈值。\n图文映射与可读性达标，流程完成。`
    : `审核未通过\n\n综合评分 ${(qualityScores.overall * 100).toFixed(0)} 分，低于阈值。\n建议：\n${feedback.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n") || "1. 请根据低分维度优化"}`;

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
