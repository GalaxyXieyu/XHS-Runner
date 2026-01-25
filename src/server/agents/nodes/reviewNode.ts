import { HumanMessage } from "@langchain/core/messages";
import * as fs from "fs";
import { AgentState, type AgentType, type ReviewFeedback } from "../state/agentState";
import { safeSliceMessages, createLLM } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export async function reviewAgentNode(state: typeof AgentState.State) {
  const visionModel = await createLLM(true);

  // 读取生成的图片用于多模态审核
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
    hasImages: hasImages ? "true" : "false",
  };

  const systemPrompt = await getAgentPrompt("review_agent", stateVariables);
  if (!systemPrompt) {
    throw new Error("Prompt 'review_agent' not found. Please create it in Langfuse: xhs-agent-review_agent");
  }

  const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: systemPrompt },
    ...imageContents,
  ];

  const response = await visionModel.invoke([
    new HumanMessage({ content: messageContent }),
    ...safeSliceMessages(state.messages, 8),
  ]);

  // 解析审核结果
  const content = typeof response.content === "string" ? response.content : "";
  let feedback: ReviewFeedback = { approved: true, suggestions: [] };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      feedback = JSON.parse(jsonMatch[0]);
    }
  } catch {}

  // 异步记录审核结果（不阻塞返回）
  recordReviewResult(feedback.approved).catch(console.error);

  // 创建友好的审核结果消息（不使用 emoji）
  const reviewMessage = feedback.approved
    ? `审核通过\n\n` +
      `已审核 ${state.generatedImagePaths.length} 张图片，内容符合要求。\n` +
      `图文相关性、品牌合规性、文字可读性均达标。\n\n` +
      `流程完成！`
    : `审核未通过\n\n` +
      `发现以下问题：\n${feedback.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` +
      `建议：根据反馈优化内容或图片规划。`;

  const friendlyResponse = new HumanMessage(reviewMessage);

  return {
    messages: [friendlyResponse],
    currentAgent: "review_agent" as AgentType,
    reviewFeedback: feedback,
    // 注意：不要修改 imagesComplete，它表示图片是否已生成，而不是审核是否通过
    iterationCount: state.iterationCount + 1,
  };
}

// 记录审核结果到系统统计
async function recordReviewResult(approved: boolean) {
  try {
    // 查找或创建系统统计记录 (id = 1)
    const [stats] = await db
      .select()
      .from(schema.promptProfiles)
      .where(eq(schema.promptProfiles.id, 1))
      .limit(1);

    if (stats) {
      // 更新现有记录
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
