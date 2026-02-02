import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { isHttpUrl, uploadBase64ToSuperbed, generateImageWithReference } from "../../services/xhs/integration/imageProvider";
import { storeAsset } from "../../services/xhs/integration/assetStore";
import { getSetting } from "../../settings";
import { db, schema } from "../../db";
import * as fs from "fs";
import * as path from "path";

export async function imageAgentNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const plans = state.imagePlans;
  const optimizedPrompts = state.reviewFeedback?.optimizedPrompts || [];

  // 获取参考图数据并上传
  const rawReferenceImages = state.referenceImages && state.referenceImages.length > 0
    ? state.referenceImages
    : (state.referenceImageUrl ? [state.referenceImageUrl] : []);

  const processedRefImageUrls: string[] = [];
  for (let i = 0; i < rawReferenceImages.length; i++) {
    let url = rawReferenceImages[i];
    if (url && !isHttpUrl(url)) {
      try {
        console.log(`[imageAgentNode] 正在上传第 ${i + 1} 张 base64 参考图到 Superbed...`);
        url = await uploadBase64ToSuperbed(url, `agent-ref-${Date.now()}-${i}.png`);
        console.log(`[imageAgentNode] 上传成功: ${url}`);
      } catch (e) {
        console.warn(`[imageAgentNode] 第 ${i + 1} 张参考图上传失败:`, e);
      }
    }
    if (url) processedRefImageUrls.push(url);
  }

  console.log(`[imageAgentNode] 参考图已上传: ${processedRefImageUrls.length} 个`);

  // 直接生成图片，不使用工具
  // 优先从 state 读取用户选择的 provider，其次从数据库设置读取，最后默认 jimeng
  const provider = state.imageGenProvider || (await getSetting('imageGenProvider')) || 'jimeng';
  console.log(`[imageAgentNode] 开始生成 ${plans.length} 张图片, provider=${provider}`);

  const results: any[] = [];
  const generatedPaths: string[] = [];
  const generatedAssetIds: number[] = [];

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const prompt = optimizedPrompts[i] || plan.prompt || plan.description;
    const sequence = plan.sequence;
    const role = plan.role;

    try {
      console.log(`[imageAgentNode] 生成第 ${i + 1}/${plans.length} 张 (seq=${sequence}, role=${role})`);
      const result = await generateImageWithReference({
        prompt,
        referenceImageUrls: processedRefImageUrls,
        provider: provider as "gemini" | "jimeng",
        aspectRatio: "3:4",
      });

      // Generate filename and store asset to database
      const filename = `img_${Date.now()}_${sequence}.png`;

      console.log(`[imageAgentNode] 正在保存第 ${i + 1} 张到数据库...`);
      const asset = await storeAsset({
        type: 'image',
        filename,
        data: result.imageBuffer,
        metadata: {
          prompt,
          sequence,
          role,
          provider,
          aspectRatio: "3:4",
          ...result.metadata,
        },
      });

      console.log(`[imageAgentNode] 第 ${i + 1} 张成功保存 (asset_id=${asset.id}, ${Math.round(result.imageBuffer.length / 1024)}KB)`);

      // Create creative_assets relationship if creativeId exists
      if (state.creativeId) {
        try {
          await db.insert(schema.creativeAssets).values({
            creativeId: state.creativeId,
            assetId: asset.id,
            sortOrder: sequence,
          });
          console.log(`[imageAgentNode] 已关联 creative_id=${state.creativeId} 和 asset_id=${asset.id}`);
        } catch (err) {
          // Ignore duplicate or constraint errors
          console.warn(`[imageAgentNode] 关联失败 (可能已存在):`, err);
        }
      }

      results.push({ sequence, role, success: true, path: asset.path, assetId: asset.id });
      generatedPaths.push(asset.path);
      generatedAssetIds.push(asset.id);
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[imageAgentNode] 第 ${i + 1} 张失败: ${errorMsg}`);
      results.push({ sequence, role, success: false, error: errorMsg });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const message = `批量生成完成: ${successCount}/${plans.length} 成功`;
  console.log(`[imageAgentNode] ${message}`);

  return {
    messages: [new HumanMessage(message)],
    currentAgent: "image_agent" as AgentType,
    reviewFeedback: null,
    generatedImagePaths: [...(state.generatedImagePaths || []), ...generatedPaths],
    generatedImageAssetIds: [...(state.generatedImageAssetIds || []), ...generatedAssetIds],
    generatedImageCount: (state.generatedImageCount || 0) + successCount,
    imagesComplete: successCount === plans.length,
  };
}
