import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType } from "../state/agentState";
import { isHttpUrl, uploadBase64ToSuperbed, generateImageWithReference } from "../../services/xhs/integration/imageProvider";
import { storeAsset } from "../../services/xhs/integration/assetStore";
import { getSetting } from "../../settings";
import { emitImageProgress } from "../utils/progressEmitter";
import { requestAgentClarification } from "../utils/agentClarification";

export async function imageAgentNode(state: typeof AgentState.State, _model: ChatOpenAI) {
  const plans = state.imagePlans;
  const optimizedPrompts = state.reviewFeedback?.optimizedPrompts || [];

  const needImageStyleClarification =
    plans.length > 0
    && state.referenceImages.length === 0
    && state.referenceAnalyses.length === 0;

  if (needImageStyleClarification) {
    const clarificationResult = requestAgentClarification(state, {
      key: "image_agent.style_hint",
      agent: "image_agent",
      question: "生成图片前，你希望视觉风格偏向哪一类？",
      options: [
        { id: "realistic", label: "写实风", description: "真实质感、生活化场景" },
        { id: "clean_graphic", label: "极简图文风", description: "干净背景+明确信息层次" },
        { id: "continue_default", label: "按默认风格", description: "系统根据文案自动适配" },
      ],
      selectionType: "single",
      allowCustomInput: true,
    });

    if (clarificationResult) {
      return {
        ...clarificationResult,
        currentAgent: "image_agent" as AgentType,
        imagesComplete: false,
      };
    }
  }

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
  const progressThreadId = state.threadId;
  if (!progressThreadId) {
    console.warn('[imageAgentNode] missing threadId, skip progress emit');
  }
  const reportProgress = progressThreadId
    ? (event: Parameters<typeof emitImageProgress>[1]) => emitImageProgress(progressThreadId, event)
    : () => {};

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
      reportProgress({
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
      reportProgress({
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
      reportProgress({
        taskId,
        status: 'failed',
        progress: 0,
        errorMessage: errorMsg,
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const processedCount = results.length; // 已处理数量（包括成功和失败）
  const message = `批量生成完成: ${successCount}/${plans.length} 成功`;
  console.log(`[imageAgentNode] ${message}`);

  // 添加最终完成消息
  messages.push(new AIMessage(message));

  // imagesComplete 应该在所有图片都处理完成时（无论成功或失败）为 true
  // 这样才能确保流程正确继续
  const allImagesProcessed = processedCount === plans.length;

  return {
    messages,
    currentAgent: "image_agent" as AgentType,
    reviewFeedback: null,
    generatedImagePaths: generatedPaths,
    generatedImageAssetIds: generatedAssetIds,
    generatedImageCount: (state.generatedImageCount || 0) + successCount,
    imagesComplete: allImagesProcessed,
  };
}
