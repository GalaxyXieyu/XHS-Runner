import { NextApiRequest, NextApiResponse } from "next";
import { HumanMessage } from "@langchain/core/messages";
import { createMultiAgentSystem } from "@/server/agents/multiAgentSystem";
import { processAgentStream } from "@/server/agents/utils/streamProcessor";
import { AgentEvent } from "@/server/agents/state/agentState";
import { addDatasetItem, createTrace, flushLangfuse } from "@/server/services/langfuseService";
import { createCreative, updateCreative } from "@/server/services/xhs/data/creativeService";
import { v4 as uuidv4 } from "uuid";
import { detectIntent } from "@/server/agents/tools/intentTools";
import { resetImageToolCallCount } from "@/server/agents/routing";
import { startTraj, endTraj } from "@/server/agents/utils";
import { registerProgressCallback, unregisterProgressCallback } from "@/server/agents/utils/progressEmitter";
import { detectContentType } from "@/server/services/contentTypeDetector";
import { db } from "@/server/db";
import { conversations, conversationMessages } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { parseWriterContent } from "./streamUtils";
import { writeRunArtifacts } from "@/server/agents/utils/runArtifacts";


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    message,
    themeId,
    referenceImageUrl,
    referenceImages,
    referenceInputs,
    layoutPreference,
    imageGenProvider,
    enableHITL,
    fastMode,
  } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // 兼容旧字段并归一化参考图输入
  const normalizedReferenceInputs: Array<{ url: string; type?: "style" | "layout" | "content" }> =
    Array.isArray(referenceInputs) && referenceInputs.length > 0
      ? referenceInputs
          .map((item: any) => ({
            url: typeof item?.url === "string" ? item.url : "",
            type: ["style", "layout", "content"].includes(item?.type) ? item.type : undefined,
          }))
          .filter((item: any) => item.url)
      : (Array.isArray(referenceImages)
          ? referenceImages.map((url: string) => ({ url }))
          : (referenceImageUrl ? [{ url: referenceImageUrl }] : []));

  const refImages: string[] = normalizedReferenceInputs.map((item) => item.url);
  const hasReferenceImage = refImages.length > 0;
  const provider = imageGenProvider || 'jimeng'; // 默认使用即梦
  const streamThreadId = uuidv4();
  const threadId = enableHITL ? streamThreadId : undefined;
  const langfuseSessionId = threadId || streamThreadId;
  const langfuseTags = [
    'agent-flow',
    'agent-stream',
    enableHITL ? 'hitl' : 'no-hitl',
    fastMode ? 'fast-mode' : 'normal-mode',
    provider ? `img:${provider}` : null,
    hasReferenceImage ? 'has-ref-image' : 'no-ref-image',
    themeId ? `theme:${themeId}` : null,
  ].filter(Boolean) as string[];

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let imageAgentStarted = false;

  const sendEvent = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
    // 收集事件用于持久化
    collectedEvents.push(event);
  };

  // Enhanced event senders for real-time progress tracking
  const sendImageProgress = (taskId: number, status: string, progress: number, url?: string, errorMessage?: string) => {
    if (!imageAgentStarted) {
      imageAgentStarted = true;
      sendEvent({
        type: 'agent_start',
        agent: 'image_agent',
        content: "图片生成 开始工作...",
        timestamp: Date.now(),
      } as any);
    }

    sendEvent({
      type: 'image_progress',
      taskId,
      status,
      progress,
      url,
      errorMessage,
      timestamp: Date.now(),
    } as any);
  };

  // 注册图片进度回调，用于 imageAgentNode 实时推送进度
  const progressCallbackId = streamThreadId;
  registerProgressCallback(progressCallbackId, (event) => {
    sendImageProgress(
      event.taskId,
      event.status,
      event.progress,
      event.assetId ? String(event.assetId) : event.url,
      event.errorMessage
    );
  });

  // 清理函数：在请求结束时取消注册回调
  const cleanup = () => {
    unregisterProgressCallback(progressCallbackId);
  };

  // 监听连接关闭事件，确保清理
  res.on('close', cleanup);

  const sendContentUpdate = (title?: string, body?: string, tags?: string[]) => {
    sendEvent({
      type: 'content_update',
      title,
      body,
      tags,
      timestamp: Date.now(),
    } as any);
  };

  const sendWorkflowProgress = (phase: string, progress: number, currentAgent: string) => {
    sendEvent({
      type: 'workflow_progress',
      phase,
      progress,
      currentAgent,
      timestamp: Date.now(),
    } as any);
  };

  // 保存 assistant 消息到数据库
  const saveAssistantMessages = async (askUserData?: any) => {
    if (!conversationId) return;
    
    try {
      // 从收集的事件中提取 assistant 消息内容
      const messageEvents = collectedEvents.filter(e => e.type === 'message' && e.content);
      const content = messageEvents.map(e => e.content).join('\n\n') || '处理完成';
      const lastAgent = messageEvents[messageEvents.length - 1]?.agent;
      
      await db.insert(conversationMessages).values({
        conversationId,
        role: 'assistant',
        content,
        agent: lastAgent || null,
        askUser: askUserData || null,
        events: collectedEvents.length > 0 ? collectedEvents : null,
      });
      
      // 更新对话的 updatedAt 和 creativeId
      await db.update(conversations)
        .set({ 
          updatedAt: new Date(),
          creativeId: creativeId || null,
        })
        .where(eq(conversations.id, conversationId));
    } catch (err) {
      console.error('Failed to save assistant message:', err);
    }
  };

  // 创建 Langfuse trace
  const trace = await createTrace(
    'agent-stream',
    {
      message,
      themeId,
      threadId: langfuseSessionId,
      hasReferenceImage,
      referenceImageCount: refImages.length,
      referenceInputCount: normalizedReferenceInputs.length,
    },
    {
      sessionId: langfuseSessionId,
      tags: langfuseTags,
    }
  );
  const traceId = trace?.id;

  // 用于保存 creativeId
  let creativeId: number | undefined;
  let workflowCompleted = false;
  let workflowPaused = false;

  // 对话持久化：创建 conversation 记录
  let conversationId: number | undefined;
  const collectedEvents: any[] = [];

  // Collect agent I/O for local run artifacts and offline indexing.
  const agentInputs = new Map<string, any>();
  const agentOutputs = new Map<string, any>();

  // Best-effort local artifacts for debugging and indexing.
  const flushRunArtifacts = async (status: "completed" | "paused" | "aborted" | "failed", errorMessage?: string) => {
    try {
      await writeRunArtifacts({
        runId: streamThreadId,
        conversationId,
        message,
        themeId: themeId ? Number(themeId) : undefined,
        tags: langfuseTags,
        status,
        collectedEvents,
        agentInputs,
        agentOutputs,
        errorMessage,
      });
    } catch (e) {
      console.warn("[stream] Failed to write run artifacts", e);
    }
  };
  
  if (threadId) {
    try {
      const [conversation] = await db
        .insert(conversations)
        .values({
          themeId: themeId ? Number(themeId) : null,
          threadId,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
          metadata: { imageGenProvider: provider, referenceImages: refImages, referenceInputs: normalizedReferenceInputs, layoutPreference },
          status: 'active',
        })
        .returning();
      conversationId = conversation.id;
      
      // 立即保存用户消息
      await db.insert(conversationMessages).values({
        conversationId,
        role: 'user',
        content: message,
      });
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }

  // 发送初始事件（包含 conversationId）
  const initEvent: any = {
    type: "agent_start",
    agent: "supervisor",
    content: hasReferenceImage
      ? `开始处理请求 (${refImages.length}张参考图)...`
      : "开始处理请求...",
    timestamp: Date.now(),
  };
  if (conversationId) {
    initEvent.conversationId = conversationId;
  }
  sendEvent(initEvent);

  const markCreativeAborted = async (reason: string) => {
    if (!creativeId || workflowCompleted || workflowPaused) return;
    try {
      await updateCreative({ id: creativeId, status: 'aborted' });
      if (conversationId) {
        await db.update(conversations)
          .set({ status: 'aborted', updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      }
      console.warn(`[stream] Marked creative ${creativeId} as aborted (${reason})`);
    } catch (err) {
      console.error('[stream] Failed to mark creative aborted:', err);
    }
  };

  res.on('close', () => {
    if (res.writableEnded) return;
    void markCreativeAborted('client_closed');
    void flushRunArtifacts("aborted", "client_closed");
  });

  // 开始轨迹记录
  const trajId = streamThreadId;
  startTraj(trajId, message, hasReferenceImage, themeId);

  // 意图识别
  const intentResult = detectIntent(message);
  if (intentResult.confidence > 0.5) {
    sendEvent({
      type: "intent_detected",
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      suggestedCategory: intentResult.suggestedCategory,
      keywords: intentResult.keywords,
      timestamp: Date.now(),
    } as any);
  }

  // 自动检测内容类型
  const contentTypeDetection = detectContentType(message);

  // 发送内容类型检测事件
  sendEvent({
    type: "content_type_detected",
    contentType: contentTypeDetection.type,
    confidence: contentTypeDetection.confidence,
    reasoning: contentTypeDetection.reasoning,
    timestamp: Date.now(),
  } as any);

  try {
    // 重置图片生成计数（每次请求独立计数）
    resetImageToolCallCount(streamThreadId);

    // 提前创建 creative，确保后续图片能关联到同一条记录
    if (themeId) {
      try {
        const creative = await createCreative({
          themeId,
          status: "processing",
          model: "agent",
          prompt: message,
        });
        creativeId = creative.id;
      } catch (createError) {
        console.error("Failed to precreate creative:", createError);
      }
    }

    const app = await createMultiAgentSystem({
      enableHITL: !!enableHITL,
      threadId,
      langfuseSessionId,
      langfuseTags,
    });

    const contextMessage = themeId
      ? `[当前主题ID: ${themeId}] ${message}`
      : message;

    // 初始状态，包含参考图和图片生成模型
    const initialState: any = {
      messages: [new HumanMessage(contextMessage)],
      imageGenProvider: provider,
      threadId: streamThreadId,
      contentType: contentTypeDetection.type,
      creativeId: creativeId ?? null,
      fastMode: fastMode || false,
    };
    if (refImages.length > 0) {
      initialState.referenceImages = refImages;
      initialState.referenceImageUrl = refImages[0]; // 兼容旧代码
      initialState.referenceInputs = normalizedReferenceInputs;
    }
    if (["dense", "balanced", "visual-first"].includes(layoutPreference)) {
      initialState.layoutPreference = layoutPreference;
    }

    const streamConfig: any = { recursionLimit: 100, streamMode: ["updates", "tasks"] };
    if (threadId) {
      streamConfig.configurable = { thread_id: threadId };
    }

    const stream = await app.stream(initialState, streamConfig) as AsyncIterable<[string, any]>;
    let writerContent: { title: string; body: string; tags: string[] } | null = null;
    let imagePlans: any[] = [];
    let generatedAssetIds: number[] = [];
    agentInputs.clear();
    agentOutputs.clear();

    const buildAgentInput = (agent: string, output: any) => ({
      agent,
      message,
      themeId,
      contentType: contentTypeDetection.type,
      referenceImages: refImages,
      imageGenProvider: provider,
      threadId: threadId || streamThreadId,
      creativeId: creativeId ?? null,
      state: {
        currentAgent: output?.currentAgent,
        iterationCount: output?.iterationCount,
        maxIterations: output?.maxIterations,
        summary: output?.summary,
      },
    });

    const buildAgentOutput = (output: any) => ({
      messages: Array.isArray(output?.messages)
        ? output.messages.map((msg: any) => ({
          type: typeof msg?._getType === 'function' ? msg._getType() : msg?.type,
          name: msg?.name,
          content: msg?.content,
          tool_calls: msg?.tool_calls,
          tool_call_id: msg?.tool_call_id,
        }))
        : [],
      contentComplete: output?.contentComplete,
      imagePlans: output?.imagePlans,
      reviewFeedback: output?.reviewFeedback,
      imagesComplete: output?.imagesComplete,
      generatedImageAssetIds: output?.generatedImageAssetIds,
      generatedImagePaths: output?.generatedImagePaths,
      summary: output?.summary,
      creativeBrief: output?.creativeBrief,
      evidencePack: output?.evidencePack,
      referenceAnalyses: output?.referenceAnalyses,
      layoutSpec: output?.layoutSpec,
      bodyBlocks: output?.bodyBlocks,
      paragraphImageBindings: output?.paragraphImageBindings,
      textOverlayPlan: output?.textOverlayPlan,
      qualityScores: output?.qualityScores,
    });

    // 将 _tools 节点名归一化到父 agent
    const toParentAgent = (name: string) =>
      name.endsWith("_tools") ? name.slice(0, -6) : name;

    const handleNodeOutput = async (nodeName: string, output: any) => {
      if (nodeName === "__start__" || nodeName === "__end__" || nodeName === "__interrupt__") return;
      if (nodeName === "supervisor_route") return;

      const effectiveAgent = toParentAgent(nodeName);

      agentInputs.set(nodeName, buildAgentInput(nodeName, output));
      if (nodeName !== "supervisor_route") {
        const agentOutput = buildAgentOutput(output);
        agentOutputs.set(nodeName, agentOutput);
      }

      if (nodeName === "writer_agent") {
        let parsed: { title: string; body: string; tags: string[] } | null = output?.generatedContent || null;
        if (!parsed && output?.messages?.length) {
          const lastMsg = output.messages[output.messages.length - 1];
          if (typeof lastMsg?.content === "string" && lastMsg.content.trim()) {
            try {
              parsed = parseWriterContent(lastMsg.content);
            } catch {
              parsed = null;
            }
          }
        }

        if (parsed) {
          writerContent = parsed;
          sendContentUpdate(parsed.title, parsed.body, parsed.tags);

          try {
            if (creativeId) {
              await updateCreative({
                id: creativeId,
                title: parsed.title,
                content: parsed.body,
                tags: parsed.tags.join(","),
                model: "agent",
                prompt: message,
              });
            }
          } catch (saveError) {
            console.error("Failed to save creative:", saveError);
          }
        }
      }

      const stateChanges: string[] = [];
      if (nodeName === "writer_agent" && output.contentComplete) {
        stateChanges.push("内容创作完成");
      }
      if (nodeName === "image_planner_agent" && output.imagePlans?.length > 0) {
        imagePlans = output.imagePlans;
        stateChanges.push(`图片规划完成 (${output.imagePlans.length}张)`);
        output.imagePlans.forEach((plan: any, index: number) => {
          sendImageProgress(index + 1, 'queued', 0);
        });
      }
      if (nodeName === "image_agent") {
        if (output.imagesComplete) {
          stateChanges.push("图片生成完成");
          if (output.generatedImageAssetIds?.length > 0) {
            generatedAssetIds = output.generatedImageAssetIds;
            output.generatedImageAssetIds.forEach((assetId: number, index: number) => {
              sendImageProgress(index + 1, 'complete', 1, String(assetId));
            });
          } else if (output.generatedImagePaths?.length > 0) {
            output.generatedImagePaths.forEach((path: string, index: number) => {
              const assetIdMatch = path.match(/\/api\/assets\/(\d+)/);
              const assetId = assetIdMatch ? assetIdMatch[1] : path;
              sendImageProgress(index + 1, 'complete', 1, assetId);
              if (assetIdMatch) {
                generatedAssetIds.push(parseInt(assetIdMatch[1], 10));
              }
            });
          }
        } else if (output.imagePlans?.length > 0) {
          output.imagePlans.forEach((plan: any, index: number) => {
            const currentCount = output.generatedImageAssetIds?.length || output.generatedImagePaths?.length || 0;
            const progress = currentCount > index ? 1 : 0.5;
            const status = currentCount > index ? 'complete' : 'generating';
            if (currentCount > index && output.generatedImageAssetIds?.[index]) {
              sendImageProgress(index + 1, status, progress, String(output.generatedImageAssetIds[index]));
            } else if (currentCount > index && output.generatedImagePaths?.[index]) {
              const path = output.generatedImagePaths[index];
              const assetIdMatch = path.match(/\/api\/assets\/(\d+)/);
              const assetId = assetIdMatch ? assetIdMatch[1] : path;
              sendImageProgress(index + 1, status, progress, assetId);
            } else {
              sendImageProgress(index + 1, status, progress);
            }
          });
        }
      }
      if (nodeName === "brief_compiler_agent" && output.creativeBrief) {
        sendEvent({
          type: "brief_ready",
          agent: nodeName,
          content: "创作 Brief 已生成",
          brief: output.creativeBrief,
          timestamp: Date.now(),
        } as any);
      }
      if (nodeName === "layout_planner_agent" && output.layoutSpec?.length > 0) {
        sendEvent({
          type: "layout_spec_ready",
          agent: nodeName,
          content: `版式规划完成 (${output.layoutSpec.length}张)`,
          layoutSpec: output.layoutSpec,
          timestamp: Date.now(),
        } as any);
      }
      if (nodeName === "image_planner_agent" && output.paragraphImageBindings?.length > 0) {
        sendEvent({
          type: "alignment_map_ready",
          agent: nodeName,
          content: `段落映射完成 (${output.paragraphImageBindings.length}条)`,
          paragraphImageBindings: output.paragraphImageBindings,
          textOverlayPlan: output.textOverlayPlan || [],
          bodyBlocks: output.bodyBlocks || [],
          timestamp: Date.now(),
        } as any);
      }
      if (nodeName === "review_agent" && output.qualityScores) {
        sendEvent({
          type: "quality_score",
          agent: nodeName,
          content: `综合评分 ${(Number(output.qualityScores?.overall || 0) * 100).toFixed(0)} 分`,
          qualityScores: output.qualityScores,
          timestamp: Date.now(),
        } as any);
      }
      if (nodeName === "review_agent" && output.reviewFeedback?.approved) {
        stateChanges.push("审核通过 - 流程结束");
      }
      if (stateChanges.length > 0) {
        sendEvent({
          type: "state_update",
          agent: effectiveAgent,
          changes: stateChanges.join("; "),
          timestamp: Date.now(),
        } as any);
      }
    };

    let lastAskUser: AgentEvent | null = null;
    const onCreativeCreated = (newCreativeId: number) => {
      creativeId = newCreativeId;
    };

    for await (const event of processAgentStream(stream, {
      themeId,
      traceId,
      trajId,
      threadId: threadId ?? undefined,
      enableHITL,
      creativeId,
      onCreativeCreated,
      onImagePlansExtracted: (plans) => {
        imagePlans = plans;
      },
      onNodeOutput: handleNodeOutput,
    })) {
      if (event.type === "agent_start" && event.agent === "image_agent") {
        if (imageAgentStarted) {
          continue;
        }
        imageAgentStarted = true;
      }

      sendEvent(event);

      if (event.type === "ask_user") {
        lastAskUser = event;
      }

      if (event.type === "workflow_paused") {
        workflowPaused = true;
      }

      if (event.type === "workflow_complete") {
        workflowCompleted = true;
        const completeEvent = event as any;
        if (completeEvent.creativeId) {
          creativeId = completeEvent.creativeId;
        }
        if (Array.isArray(completeEvent.imageAssetIds)) {
          generatedAssetIds = completeEvent.imageAssetIds;
        }
      }
    }

    if (lastAskUser) {
      await saveAssistantMessages(lastAskUser);
      await flushRunArtifacts("paused");
      await flushLangfuse();
      res.end();
      return;
    }

    if (creativeId && workflowCompleted) {
      console.log(`[stream] Workflow completed successfully, recording to dataset. creativeId: ${creativeId}`);

      for (const [agentName, output] of agentOutputs.entries()) {
        const input = agentInputs.get(agentName) || { message, themeId };

        void addDatasetItem({
          agentName,
          input,
          output,
          traceId,
          metadata: {
            themeId,
            creativeId,
            timestamp: new Date().toISOString(),
            agent: agentName,
            workflowCompleted: true,
          },
        }).catch((error) => {
          console.error(`[langfuse] Failed to record dataset item for ${agentName}:`, error);
        });
      }
    } else {
      if (!creativeId) {
        console.log(`[stream] No creativeId created, skipping dataset recording`);
      } else if (!workflowCompleted) {
        console.log(`[stream] Workflow did not complete successfully, skipping dataset recording`);
      }
    }

    // 保存 assistant 消息
    await saveAssistantMessages();
    
    // 更新对话状态为完成
    if (conversationId) {
      await db.update(conversations)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }
    
    res.write(`data: [DONE]\n\n`);
    await flushRunArtifacts("completed");
    // 结束轨迹记录
    endTraj(trajId, true, { creative: creativeId, images: imagePlans.length });
    await flushLangfuse();
    res.end();
  } catch (error: unknown) {
    // 记录失败轨迹
    endTraj(trajId, false);
    console.error("Multi-agent error:", error);
    console.error("Error type:", typeof error);
    console.error("Error constructor:", error?.constructor?.name);
    if (error && typeof error === 'object') {
      console.error("Error keys:", Object.keys(error));
    }
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String((error as any).message);
    } else {
      errorMessage = String(error);
    }
    sendEvent({
      type: "message",
      content: `错误: ${errorMessage}`,
      timestamp: Date.now(),
    });
    if (creativeId && !workflowCompleted) {
      try {
        await updateCreative({ id: creativeId, status: 'failed' });
      } catch (err) {
        console.error('[stream] Failed to mark creative failed:', err);
      }
    }
    await flushRunArtifacts("failed", errorMessage);
    res.end();
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // 支持大图片 base64
    },
  },
};
