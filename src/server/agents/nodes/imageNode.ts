import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType } from "../state/agentState";
import { isHttpUrl, uploadBase64ToSuperbed, generateImageWithReference } from "../../services/xhs/integration/imageProvider";
import { storeAsset } from "../../services/xhs/integration/assetStore";
import { getSetting } from "../../settings";
import { emitImageProgress } from "../utils/progressEmitter";

export async function imageAgentNode(state: typeof AgentState.State, _model: ChatOpenAI) {
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
  const messages: any[] = [];

  // 获取 threadId 用于发送进度事件
  const threadId = state.threadId || 'global';

  // 生成唯一标识符，确保文件名不冲突
  const batchId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const prompt = optimizedPrompts[i] || plan.prompt || plan.description;
    const sequence = plan.sequence;
    const role = plan.role;
    const taskId = i + 1; // 1-based task ID

    try {
      console.log(`[imageAgentNode] 生成第 ${taskId}/${plans.length} 张 (seq=${sequence}, role=${role})`);

      // 添加进度消息
      messages.push(new AIMessage(`[PROGRESS] 正在生成第 ${taskId}/${plans.length} 张图片 (${role})...`));

      // 发送 generating 状态
      emitImageProgress(threadId, {
        taskId,
        status: 'generating',
        progress: 0.3,
      });

      const result = await generateImageWithReference({
        prompt,
        referenceImageUrls: processedRefImageUrls,
        provider: provider as "gemini" | "jimeng" | "jimeng-45",
        aspectRatio: "3:4",
      });

      // Generate unique filename (使用 batchId + taskId 确保唯一)
      const filename = `img_${batchId}_${taskId}.png`;

      console.log(`[imageAgentNode] 正在保存第 ${taskId} 张到数据库...`);
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

      console.log(`[imageAgentNode] 第 ${taskId} 张成功保存 (asset_id=${asset.id}, ${Math.round(result.imageBuffer.length / 1024)}KB)`);

      // 注意：creative_assets 关联已移至 streamProcessor 中统一处理
      // 这样可以确保只有在流程完全成功后才创建关联

      results.push({ sequence, role, success: true, path: asset.url, assetId: asset.id });
      generatedPaths.push(asset.url);
      generatedAssetIds.push(asset.id);

      // 添加成功消息
      messages.push(new AIMessage(`[PROGRESS] 第 ${taskId}/${plans.length} 张图片生成成功`));

      // 发送 complete 状态（实时推送到前端）
      emitImageProgress(threadId, {
        taskId,
        status: 'complete',
        progress: 1,
        assetId: asset.id,
        url: `/api/assets/${asset.id}`,
      });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[imageAgentNode] 第 ${taskId} 张失败: ${errorMsg}`);
      results.push({ sequence, role, success: false, error: errorMsg });

      // 添加失败消息
      messages.push(new AIMessage(`[PROGRESS] 第 ${taskId}/${plans.length} 张图片生成失败: ${errorMsg}`));

      // 发送 failed 状态
      emitImageProgress(threadId, {
        taskId,
        status: 'failed',
        progress: 0,
        errorMessage: errorMsg,
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const message = `批量生成完成: ${successCount}/${plans.length} 成功`;
  console.log(`[imageAgentNode] ${message}`);

  // 添加最终完成消息
  messages.push(new AIMessage(message));

  return {
    messages,
    currentAgent: "image_agent" as AgentType,
    reviewFeedback: null,
    generatedImagePaths: generatedPaths,
    generatedImageAssetIds: generatedAssetIds,
    generatedImageCount: (state.generatedImageCount || 0) + successCount,
    imagesComplete: successCount === plans.length,
  };
}
