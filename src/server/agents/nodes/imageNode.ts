import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type ReferenceInput } from "../state/agentState";
import { isHttpUrl, uploadBase64ToSuperbed, generateImageWithReference } from "../../services/xhs/integration/imageProvider";
import { applyCoverTextOverlay, isCoverTextOverlayEnabled } from "../../services/xhs/integration/coverTextOverlay";
import {
  coverTitleCardToDataUrl,
  generateCoverTitleCardPng,
  isCoverTitleCardReferenceEnabled,
} from "../../services/xhs/integration/coverTitleCardReference";
import { storeAsset } from "../../services/xhs/integration/assetStore";
import { getSetting } from "../../settings";
import { emitImageProgress } from "../utils/progressEmitter";
import { emitImagePromptReady } from "../utils/promptEmitter";
import { requestAgentClarification } from "../utils/agentClarification";
import { analyzeReferenceImages } from "../../services/xhs/llm/geminiClient";
import { buildFinalImagePrompt, buildReferenceInsightsFromInputs, sha256Hex } from "../../services/xhs/integration/referencePromptAugmentor";
import type { ReferenceImageInsight } from "../../services/xhs/referenceImageInsights";
import { logSpan } from "../../services/langfuseService";

function normalizeCoverHeadline(input: string): string {
  let s = String(input || '').trim();
  s = s.replace(/^小红书封面\s*[:：]?\s*/g, '');
  s = s.split(/[\n\r，,。.!！?？:：;；、|]/)[0];
  s = s.replace(/\s+/g, '');
  s = s.replace(/[“”"'‘’《》【】\[\]（）()]/g, '');
  s = s.replace(/[。！？!?,，、:：;；]/g, '');
  if (s.length > 10) s = s.slice(0, 10);
  return s;
}

function normalizeCoverSubline(input: string): string {
  let s = String(input || '').trim();
  s = s.split(/[\n\r]/)[0];
  s = s.replace(/[“”"'‘’《》【】\[\]（）()]/g, '');
  s = s.replace(/[。！？!?,，、:：;；]/g, '');
  s = s.replace(/\s+/g, ' ');
  if (s.length > 16) s = s.slice(0, 16);
  return s.trim();
}

function guessTitleFromMessages(messages: any[]): string {
  const joined = (Array.isArray(messages) ? messages : [])
    .map((m: any) => String(m?.content || ''))
    .join('\n');

  // Prefer explicit H1 / cover-title patterns.
  const m0 = joined.match(/(?:封面)?H1\s*[:：]\s*([^\n]{2,60})/i);
  if (m0?.[1]) return m0[1];

  const m1 = joined.match(/小红书封面\s*[:：]\s*([^\n]{2,60})/);
  if (m1?.[1]) return m1[1];

  const m2 = joined.match(/封面(?:标题)?\s*[:：]\s*([^\n]{2,60})/);
  if (m2?.[1]) return m2[1];

  return '';
}

function guessCoverFieldsFromMessages(messages: any[]): {
  preset?: 2 | 3 | 6;
  h1?: string;
  h2?: string;
  badge?: string;
  footer?: string;
} {
  const joined = (Array.isArray(messages) ? messages : [])
    .map((m: any) => String(m?.content || ''))
    .join('\n');

  const takeLast = (re: RegExp): string => {
    let hit = '';
    const matches = joined.matchAll(re);
    for (const m of matches) {
      const v = String(m?.[1] || '').trim();
      if (v) hit = v;
    }
    return hit;
  };

  const presetRaw = takeLast(/(?:封面(?:排版)?预设|排版预设|封面preset|preset)\s*[:：]?\s*(2|3|6)\b/gi);
  const preset = (presetRaw === '2' || presetRaw === '3' || presetRaw === '6')
    ? (Number(presetRaw) as 2 | 3 | 6)
    : undefined;

  // Accept both English keys and common Chinese synonyms.
  const h1 = takeLast(/(?:封面)?(?:H1|主标题|标题|封面标题)\s*[:：]\s*([^\n\r]{1,80})/gi);
  const h2 = takeLast(/(?:封面)?(?:H2|副标题|副题|封面副标题)\s*[:：]\s*([^\n\r]{1,120})/gi);
  const badge = takeLast(/(?:封面)?(?:BADGE|角标|徽章|标签)\s*[:：]\s*([^\n\r]{1,40})/gi);
  const footer = takeLast(/(?:封面)?(?:FOOTER|页脚|底部|脚注)\s*[:：]\s*([^\n\r]{1,40})/gi);

  return {
    preset,
    h1: h1 || undefined,
    h2: h2 || undefined,
    badge: badge || undefined,
    footer: footer || undefined,
  };
}

function normalizeSmallLabel(input: string, maxLen: number): string {
  let s = String(input || '').trim();
  s = s.split(/[\n\r]/)[0];
  s = s.replace(/[“”"'‘’《》【】\[\]（）()]/g, '');
  s = s.replace(/\s+/g, ' ');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s.trim();
}

function deriveCoverTitleSpec(
  state: typeof AgentState.State,
  sequence: number,
  basePrompt: string
): { headline: string; subline?: string; badge?: string; footer?: string; typography?: { preset?: 2 | 3 | 6 } } | null {
  const overlayPlan = state.textOverlayPlan.find((x) => x.imageSeq === sequence);
  const messageFields = guessCoverFieldsFromMessages(state.messages);

  const rawHeadline = String(
    overlayPlan?.titleText
      || messageFields.h1
      || state.generatedContent?.title
      || state.creativeBrief?.topic
      || guessTitleFromMessages(state.messages)
      || basePrompt
      || ''
  ).trim();

  const headline = normalizeCoverHeadline(rawHeadline);
  if (!headline) return null;

  const rawSubline = String(
    overlayPlan?.bodyText
      || messageFields.h2
      || ''
  ).trim();
  const subline = normalizeCoverSubline(rawSubline);

  const badge = messageFields.badge ? normalizeSmallLabel(messageFields.badge, 8) : '';
  const footer = messageFields.footer ? normalizeSmallLabel(messageFields.footer, 12) : '';

  const typography = messageFields.preset ? { preset: messageFields.preset } : undefined;

  const out: any = subline ? { headline, subline } : { headline };
  if (badge) out.badge = badge;
  if (footer) out.footer = footer;
  if (typography) out.typography = typography;
  return out;
}

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

  // 获取参考图数据并上传（优先使用 referenceInputs，保留显式 type 供规则增强使用）
  const referenceInputs: ReferenceInput[] = Array.isArray(state.referenceInputs) && state.referenceInputs.length > 0
    ? state.referenceInputs
    : (state.referenceImages && state.referenceImages.length > 0
        ? state.referenceImages.map((url) => ({ url } as ReferenceInput))
        : (state.referenceImageUrl ? [{ url: state.referenceImageUrl } as ReferenceInput] : []));

  const rawReferenceImages = referenceInputs.map((item) => item.url).filter(Boolean);

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

  // Reference image workflow: auto-route into style/content buckets and enrich generation prompt.
  let referenceInsights: ReferenceImageInsight[] = [];
  if (processedRefImageUrls.length > 0) {
    const hasExplicitTypes = referenceInputs.some((x) => Boolean(x?.type));

    if (hasExplicitTypes) {
      referenceInsights = buildReferenceInsightsFromInputs(referenceInputs);
      console.log(`[imageAgentNode] 使用显式 referenceInputs.type，跳过 Vision 分析: ${referenceInsights.length} 个`);
    } else {
      const analysisStart = new Date();
      try {
        referenceInsights = await analyzeReferenceImages(processedRefImageUrls);
        console.log(`[imageAgentNode] 参考图分析完成: ${referenceInsights.length} 个`);

        if (state.langfuseTraceId) {
          await logSpan({
            traceId: state.langfuseTraceId,
            name: 'reference_images.analysis',
            input: {
              referenceImageCount: processedRefImageUrls.length,
              referenceImageUrlHashes: processedRefImageUrls.map((u) => sha256Hex(u).slice(0, 12)),
            },
            output: referenceInsights,
            startTime: analysisStart,
            endTime: new Date(),
            metadata: { agent: 'image_agent' },
          });
        }
      } catch (e) {
        console.warn('[imageAgentNode] 参考图分析失败，将回退为规则增强提示词:', e);
        referenceInsights = buildReferenceInsightsFromInputs(referenceInputs);
        if (referenceInsights.length > 0) {
          console.log(`[imageAgentNode] 已使用规则构建参考图洞察: ${referenceInsights.length} 个`);
        }
      }
    }
  }

  // 直接生成图片，不使用工具
  // 优先从 state 读取用户选择的 provider，其次从数据库设置读取，最后默认 ark
  const provider = state.imageGenProvider || (await getSetting('imageGenProvider')) || 'ark';
  const coverTextOverlayEnabled = isCoverTextOverlayEnabled();

  const coverOnlySignal = state.messages
    .map((m: any) => String(m?.content || ""))
    .join("\n");
  const coverOnly = /只生成\s*(?:1|一)\s*张|只生成封面|仅生成封面|只要封面|cover\s*only|only\s*cover/i.test(coverOnlySignal);

  const planTasks = plans.map((plan, index) => ({ plan, index }));
  let tasksToRun = planTasks;
  if (coverOnly && planTasks.length > 0) {
    const coverTask =
      planTasks.find((t) => t.plan.role === "cover" || t.plan.sequence === 0) || planTasks[0];
    tasksToRun = [coverTask];
    console.log(
      `[imageAgentNode] cover-only 模式已启用，将仅生成封面图 (seq=${coverTask.plan.sequence}, role=${coverTask.plan.role})`
    );
  }

  const plansToRun = tasksToRun.map((t) => t.plan);
  console.log(`[imageAgentNode] 开始生成 ${plansToRun.length} 张图片, provider=${provider}`);

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

  for (let i = 0; i < tasksToRun.length; i++) {
    const { plan, index: planIndex } = tasksToRun[i];
    const basePrompt = optimizedPrompts[planIndex] || plan.prompt || plan.description;
    const sequence = plan.sequence;
    const role = plan.role;
    const isCover = role === 'cover' || sequence === 0;

    const titleSpec = (!coverTextOverlayEnabled && isCover)
      ? deriveCoverTitleSpec(state, sequence, basePrompt)
      : null;

    const promptResult = buildFinalImagePrompt(
      basePrompt,
      referenceInsights,
      titleSpec ? { titleSpec } : undefined
    );
    let prompt = promptResult.prompt;

    let generationReferenceImageUrls = processedRefImageUrls;

    if (coverTextOverlayEnabled && isCover) {
      prompt = `${prompt}\n\nLayout instruction: leave a clean safe area at the top for a separate headline overlay; avoid adding any readable text inside the image.`;
    }

    if (!coverTextOverlayEnabled && isCover && titleSpec?.headline && isCoverTitleCardReferenceEnabled()) {
      try {
        const titleCardPng = await generateCoverTitleCardPng({
          headline: titleSpec.headline,
          subline: titleSpec.subline,
        });
        const titleCardDataUrl = coverTitleCardToDataUrl(titleCardPng);
        generationReferenceImageUrls = [...processedRefImageUrls, titleCardDataUrl];
        prompt = `${prompt}\n\nTITLE_CARD_REFERENCE: The last reference image is a title-card. Incorporate its typography/layout and ensure the headline/subline text matches TITLE_SPEC exactly.`;
      } catch (e) {
        console.warn('[imageAgentNode] cover title-card generation failed; fallback to prompt-only title spec:', e);
      }
    }

    const finalPrompt = String(prompt);
    const finalPromptHash = sha256Hex(finalPrompt);
    const finalPromptPreview = finalPrompt.slice(0, 300);

    const taskId = i + 1; // 1-based task ID


    if (state.langfuseTraceId) {
      await logSpan({
        traceId: state.langfuseTraceId,
        name: 'image.prompt.final',
        input: {
          sequence,
          role,
          provider,
          basePromptHash: promptResult.basePromptHash,
          referenceImageCount: generationReferenceImageUrls.length,
        },
        output: {
          finalPromptHash,
          ...promptResult.augmentationSummary,
        },
        metadata: { agent: 'image_agent' },
      });
    }

    try {
      console.log(`[imageAgentNode] 生成第 ${taskId}/${plansToRun.length} 张 (seq=${sequence}, role=${role})`);

      // Prompt evidence: emit BEFORE provider call so failures still have traceability.
      if (progressThreadId) {
        let imageModel: string | undefined;
        try {
          const { getImageGenRuntimeInfo } = await import('../../services/xhs/integration/imageProvider');
          const info = await getImageGenRuntimeInfo(provider as any);
          imageModel = info.imageModel;
        } catch {
          // Best-effort only; avoid breaking generation.
        }

        emitImagePromptReady(progressThreadId, {
          taskId,
          sequence,
          role,
          provider: provider as any,
          imageModel,
          finalPrompt,
          finalPromptHash,
          finalPromptPreview,
          referenceImageCount: generationReferenceImageUrls.length,
        });
      }

      // 添加进度消息
      messages.push(new AIMessage(`[PROGRESS] 正在生成第 ${taskId}/${plansToRun.length} 张图片 (${role})...`));

      // 发送 generating 状态
      reportProgress({
        taskId,
        status: 'generating',
        progress: 0.3,
      });

      const result = await generateImageWithReference({
        prompt,
        referenceImageUrls: generationReferenceImageUrls,
        provider: provider as "ark" | "gemini" | "jimeng",
        aspectRatio: "3:4",
      });

      let imageBuffer = result.imageBuffer;
      const coverOverlayPlan = state.textOverlayPlan.find((x) => x.imageSeq === sequence);
      const coverOverlayTitle = String(
        coverOverlayPlan?.titleText || state.generatedContent?.title || state.creativeBrief?.topic || ''
      ).trim();
      const coverOverlaySubtitle = String(coverOverlayPlan?.bodyText || '').trim();

      if (coverTextOverlayEnabled && isCover && coverOverlayTitle) {
        try {
          imageBuffer = await applyCoverTextOverlay(imageBuffer, {
            titleText: coverOverlayTitle,
            subtitleText: coverOverlaySubtitle || undefined,
          });
          console.log(`[imageAgentNode] cover text overlay applied (seq=${sequence})`);
        } catch (e) {
          console.warn('[imageAgentNode] cover text overlay failed, fallback to raw image:', e);
        }
      }

      // Generate unique filename (使用 batchId + taskId 确保唯一)
      const filename = `img_${batchId}_${taskId}.png`;

      console.log(`[imageAgentNode] 正在保存第 ${taskId} 张到数据库...`);
      const asset = await storeAsset({
        type: 'image',
        filename,
        data: imageBuffer,
        metadata: {
          prompt,
          sequence,
          role,
          provider,
          aspectRatio: "3:4",
          coverTextOverlay: coverTextOverlayEnabled && (role === 'cover' || sequence === 0) && coverOverlayTitle
            ? { enabled: true, titleText: coverOverlayTitle, subtitleText: coverOverlaySubtitle || undefined }
            : { enabled: false },
          ...result.metadata,
        },
      });

      console.log(`[imageAgentNode] 第 ${taskId} 张成功保存 (asset_id=${asset.id}, ${Math.round(imageBuffer.length / 1024)}KB)`);

      // 注意：creative_assets 关联已移至 streamProcessor 中统一处理
      // 这样可以确保只有在流程完全成功后才创建关联

      results.push({ sequence, role, success: true, path: asset.url, assetId: asset.id });
      generatedPaths.push(asset.url);
      generatedAssetIds.push(asset.id);

      // 添加成功消息
      messages.push(new AIMessage(`[PROGRESS] 第 ${taskId}/${plansToRun.length} 张图片生成成功`));

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
      messages.push(new AIMessage(`[PROGRESS] 第 ${taskId}/${plansToRun.length} 张图片生成失败: ${errorMsg}`));

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
  const message = `批量生成完成: ${successCount}/${plansToRun.length} 成功`;
  console.log(`[imageAgentNode] ${message}`);

  // 添加最终完成消息
  messages.push(new AIMessage(message));

  // imagesComplete 应该在所有图片都处理完成时（无论成功或失败）为 true
  // 这样才能确保流程正确继续
  const allImagesProcessed = processedCount === plansToRun.length;

  return {
    messages,
    currentAgent: "image_agent" as AgentType,
    ...(coverOnly ? { imagePlans: plansToRun } : {}),
    reviewFeedback: null,
    generatedImagePaths: generatedPaths,
    generatedImageAssetIds: generatedAssetIds,
    generatedImageCount: (state.generatedImageCount || 0) + successCount,
    imagesComplete: allImagesProcessed,
  };
}
