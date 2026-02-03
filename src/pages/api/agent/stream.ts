import { NextApiRequest, NextApiResponse } from "next";
import { HumanMessage } from "@langchain/core/messages";
import { INTERRUPT } from "@langchain/langgraph";
import { createMultiAgentSystem } from "@/server/agents/multiAgentSystem";
import { AgentEvent, AgentType } from "@/server/agents/state/agentState";
import { createTrace, logGeneration, logSpan, flushLangfuse } from "@/server/services/langfuseService";
import { createCreative, updateCreative } from "@/server/services/xhs/data/creativeService";
import { v4 as uuidv4 } from "uuid";
import type { AskUserInterrupt } from "@/server/agents/tools/askUserTool";
import { detectIntent } from "@/server/agents/tools/intentTools";
import { resetImageToolCallCount } from "@/server/agents/routing";
import { startTraj, endTraj, logAgent } from "@/server/agents/utils";
import { registerProgressCallback, unregisterProgressCallback } from "@/server/agents/utils/progressEmitter";
import { detectContentType } from "@/server/services/contentTypeDetector";
import { db } from "@/server/db";
import { conversations, conversationMessages } from "@/server/db/schema";
import { eq } from "drizzle-orm";

// 消息收集器类型
interface CollectedMessage {
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  askUser?: any;
  events?: any[];
}

// 解析 writer_agent 生成的内容（支持 JSON 和纯文本两种格式）
function parseWriterContent(content: string): { title: string; body: string; tags: string[] } {
  // 尝试解析 JSON 格式（writer_agent prompt 要求的格式）
  try {
    // 提取 JSON 部分（可能被包裹在 markdown 代码块中）
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*"title"[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

    // 尝试解析 JSON
    if (jsonStr.startsWith('{')) {
      const parsed = JSON.parse(jsonStr);
      if (parsed.title) {
        return {
          title: parsed.title,
          body: parsed.content || parsed.body || "",
          tags: Array.isArray(parsed.tags)
            ? parsed.tags.map((t: string) => t.replace(/^#/, ''))
            : [],
        };
      }
    }
  } catch {
    // JSON 解析失败，继续尝试纯文本格式
  }

  // 回退到纯文本格式解析
  const titleMatch = content.match(/标题[：:]\s*(.+?)(?:\n|$)/);
  const title = titleMatch?.[1]?.trim() || "AI 生成内容";

  const tagMatch = content.match(/标签[：:]\s*(.+?)(?:\n|$)/);
  const tagsStr = tagMatch?.[1] || "";
  const tags = tagsStr.match(/#[\w\u4e00-\u9fa5]+/g)?.map(t => t.slice(1)) || [];

  let body = content;
  if (titleMatch) {
    body = content.slice(content.indexOf(titleMatch[0]) + titleMatch[0].length);
  }
  if (tagMatch) {
    body = body.slice(0, body.indexOf(tagMatch[0])).trim();
  }

  return { title, body: body.trim() || content, tags };
}

function getAgentDisplayName(name: string): string {
  const names: Record<string, string> = {
    supervisor: "主管",
    supervisor_route: "任务路由",
    research_agent: "研究专家",
    writer_agent: "创作专家",
    style_analyzer_agent: "风格分析",
    image_planner_agent: "图片规划",
    image_agent: "图片生成",
    review_agent: "审核专家",
  };
  return names[name] || name;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, themeId, referenceImageUrl, referenceImages, imageGenProvider, enableHITL } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // 支持单个 URL 或多个 URL 数组
  const refImages: string[] = referenceImages || (referenceImageUrl ? [referenceImageUrl] : []);
  const hasReferenceImage = refImages.length > 0;
  const provider = imageGenProvider || 'jimeng'; // 默认使用即梦
  const threadId = enableHITL ? uuidv4() : undefined;

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

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
  const progressCallbackId = threadId || 'global';
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
  const trace = await createTrace('agent-stream', {
    message,
    themeId,
    hasReferenceImage,
    referenceImageCount: refImages.length,
  });
  const traceId = trace?.id;

  // 用于保存 creativeId
  let creativeId: number | undefined;
  
  // 对话持久化：创建 conversation 记录
  let conversationId: number | undefined;
  const collectedMessages: CollectedMessage[] = [];
  const collectedEvents: any[] = [];
  
  if (threadId) {
    try {
      const [conversation] = await db
        .insert(conversations)
        .values({
          themeId: themeId ? Number(themeId) : null,
          threadId,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
          metadata: { imageGenProvider: provider, referenceImages: refImages },
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

  // 开始轨迹记录
  const trajId = threadId || uuidv4();
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
    resetImageToolCallCount();

    // 提前创建 creative，确保后续图片能关联到同一条记录
    if (themeId) {
      try {
        const creative = await createCreative({
          themeId,
          status: "draft",
          model: "agent",
          prompt: message,
        });
        creativeId = creative.id;
      } catch (createError) {
        console.error("Failed to precreate creative:", createError);
      }
    }

    const app = await createMultiAgentSystem(
      enableHITL ? { enableHITL: true, threadId } : undefined
    );

    const contextMessage = themeId
      ? `[当前主题ID: ${themeId}] ${message}`
      : message;

    // 初始状态，包含参考图和图片生成模型
    const initialState: any = {
      messages: [new HumanMessage(contextMessage)],
      imageGenProvider: provider,
      threadId: threadId || "",
      contentType: contentTypeDetection.type,
      creativeId: creativeId ?? null,
    };
    if (refImages.length > 0) {
      initialState.referenceImages = refImages;
      initialState.referenceImageUrl = refImages[0]; // 兼容旧代码
    }

    const streamConfig: any = { recursionLimit: 100 };
    if (threadId) {
      streamConfig.configurable = { thread_id: threadId };
    }

    const stream = await app.stream(initialState, streamConfig);
    let lastNodeName = "";
    let writerContent: { title: string; body: string; tags: string[] } | null = null;
    let imagePlans: any[] = [];
    let generatedAssetIds: number[] = [];

    for await (const chunk of stream) {
      // 检查是否有 interrupt (askUser 工具触发)
      // chunk 可能是各种类型，需要安全检查
      if (chunk && typeof chunk === "object" && INTERRUPT in chunk) {
        const chunkWithInterrupt = chunk as { [INTERRUPT]: Array<{ value: unknown }> };
        const interrupts = chunkWithInterrupt[INTERRUPT];
        const interruptData = interrupts?.[0];
        if (interruptData?.value && typeof interruptData.value === "object" && (interruptData.value as AskUserInterrupt).type === "ask_user") {
          const askUserData = interruptData.value as AskUserInterrupt;
          const askUserEvent = {
            type: "ask_user",
            question: askUserData.question,
            options: askUserData.options,
            selectionType: askUserData.selectionType,
            allowCustomInput: askUserData.allowCustomInput,
            context: askUserData.context,
            threadId: threadId!,
            timestamp: askUserData.timestamp,
          };
          sendEvent(askUserEvent as any);
          sendEvent({
            type: "workflow_paused",
            threadId: threadId!,
            timestamp: Date.now(),
          } as any);
          // 保存 assistant 消息（包含 askUser 信息）
          await saveAssistantMessages(askUserEvent);
          await flushLangfuse();
          res.end();
          return;
        }
      }

      for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
        if (nodeName === "__start__" || nodeName === "__end__") continue;
        if (nodeName === "supervisor_with_style") continue; // 跳过内部节点

        const output = nodeOutput as any;
        const nodeStartTime = new Date();

        sendEvent({
          type: "agent_start",
          agent: nodeName,
          content: `${getAgentDisplayName(nodeName)} 开始工作...`,
          timestamp: Date.now(),
        });

        if (output.messages) {
          // 收集工具调用信息（用于后续关联）
          const toolCallsMap = new Map<string, any>();

          for (const msg of output.messages) {
            if (msg.tool_calls?.length) {
              for (const tc of msg.tool_calls) {
                toolCallsMap.set(tc.id || tc.name, tc.args);

                sendEvent({
                  type: "tool_call",
                  agent: nodeName,
                  tool: tc.name,
                  content: `调用工具: ${tc.name}`,
                  timestamp: Date.now(),
                });
              }
            }

            if (msg.name && msg.content) {
              sendEvent({
                type: "tool_result",
                agent: nodeName,
                tool: msg.name,
                content: `${msg.name} 返回结果`,
                timestamp: Date.now(),
              });

              // 记录完整的工具调用到 Langfuse（input + output）
              const toolInput = toolCallsMap.get(msg.tool_call_id) || toolCallsMap.get(msg.name) || {};
              await logSpan({
                traceId,
                name: `tool:${msg.name}`,
                input: toolInput,
                output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
                metadata: { agent: nodeName },
              });
            }

            if (msg.content && typeof msg.content === "string" && !msg.name) {
              // Supervisor 消息特殊处理：提取路由决策
              if (nodeName === "supervisor") {
                const nextMatch = msg.content.match(/NEXT:\s*(\S+)/);
                const reasonMatch = msg.content.match(/REASON:\s*(.+?)(?:\n|$)/);

                if (nextMatch) {
                  const nextAgent = nextMatch[1];
                  const reason = reasonMatch?.[1] || "继续流程";

                  sendEvent({
                    type: "supervisor_decision",
                    agent: "supervisor",
                    content: `NEXT: ${nextAgent}`,
                    decision: nextAgent,
                    reason: reason,
                    timestamp: Date.now(),
                  } as any);
                }
                continue; // 不显示原始 supervisor prompt
              }

              // 跳过包含内部路由信息的消息
              if (msg.content.includes("NEXT:") || msg.content.includes("REASON:")) continue;

              sendEvent({
                type: "message",
                agent: nodeName,
                content: msg.content,
                timestamp: Date.now(),
              });

              await logGeneration({
                traceId,
                name: nodeName,
                model: 'configured-model',
                input: { agent: nodeName },
                output: msg.content,
                startTime: nodeStartTime,
                endTime: new Date(),
              });

              // 保存 writer_agent 生成的内容到数据库
              if (nodeName === "writer_agent" && themeId) {
                try {
                  const parsed = parseWriterContent(msg.content);
                  writerContent = parsed; // 保存用于 HITL

                  // Send content update event for real-time UI updates
                  sendContentUpdate(parsed.title, parsed.body, parsed.tags);

                  if (creativeId) {
                    await updateCreative({
                      id: creativeId,
                      title: parsed.title,
                      content: parsed.body,
                      tags: parsed.tags.join(","),
                      status: "draft",
                      model: "agent",
                      prompt: message,
                    });
                  } else {
                    const creative = await createCreative({
                      themeId,
                      title: parsed.title,
                      content: parsed.body,
                      tags: parsed.tags.join(","),
                      status: "draft",
                      model: "agent",
                      prompt: message,
                    });
                    creativeId = creative.id;
                  }
                } catch (saveError) {
                  console.error("Failed to save creative:", saveError);
                }
              }

              // 捕获 image_planner_agent 的输出用于 HITL
              if (nodeName === "image_planner_agent") {
                try {
                  const planMatch = msg.content.match(/```json\s*([\s\S]*?)\s*```/);
                  if (planMatch) {
                    imagePlans = JSON.parse(planMatch[1]);
                  }
                } catch (e) {
                  console.error("Failed to parse image plans:", e);
                }
              }
            }
          }
        }

        sendEvent({
          type: "agent_end",
          agent: nodeName,
          content: `${getAgentDisplayName(nodeName)} 完成`,
          timestamp: Date.now(),
        });

        // 记录 agent 执行结果
        if (nodeName !== "supervisor" && nodeName !== "supervisor_route") {
          const summary = output.messages?.[0]?.content?.slice?.(0, 500) || "completed";
          logAgent(trajId, nodeName as AgentType, true, typeof summary === "string" ? summary : "completed");

          // 显示关键状态变化
          const stateChanges: string[] = [];
          if (nodeName === "writer_agent" && output.contentComplete) {
            stateChanges.push("内容创作完成");
          }
          if (nodeName === "image_planner_agent" && output.imagePlans?.length > 0) {
            stateChanges.push(`图片规划完成 (${output.imagePlans.length}张)`);
            // Send initial image progress events (queued status)
            output.imagePlans.forEach((plan: any, index: number) => {
              sendImageProgress(index + 1, 'queued', 0);
            });
          }
          if (nodeName === "image_agent") {
            if (output.imagesComplete) {
              stateChanges.push("图片生成完成");
              // 保存生成的图片 asset IDs
              if (output.generatedImageAssetIds?.length > 0) {
                generatedAssetIds = output.generatedImageAssetIds;
                output.generatedImageAssetIds.forEach((assetId: number, index: number) => {
                  sendImageProgress(index + 1, 'complete', 1, String(assetId));
                });
              } else if (output.generatedImagePaths?.length > 0) {
                output.generatedImagePaths.forEach((path: string, index: number) => {
                  // Extract asset ID from path (format: /api/assets/123)
                  const assetIdMatch = path.match(/\/api\/assets\/(\d+)/);
                  const assetId = assetIdMatch ? assetIdMatch[1] : path;
                  sendImageProgress(index + 1, 'complete', 1, assetId);
                  // 保存 asset ID
                  if (assetIdMatch) {
                    generatedAssetIds.push(parseInt(assetIdMatch[1], 10));
                  }
                });
              }
            } else if (output.imagePlans?.length > 0) {
              // Send generating status for images in progress
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
          if (nodeName === "review_agent" && output.reviewFeedback?.approved) {
            stateChanges.push("审核通过 - 流程结束");
          }

          if (stateChanges.length > 0) {
            sendEvent({
              type: "state_update",
              agent: nodeName,
              changes: stateChanges.join("; "),
              timestamp: Date.now(),
            } as any);
          }
        }

        // HITL: 在 writer_agent 或 image_planner_agent 完成后发送确认请求
        if (enableHITL && threadId) {
          if (nodeName === "writer_agent") {
            // 如果 writerContent 未设置，尝试从最后一条消息中解析
            if (!writerContent && output.messages?.length > 0) {
              const lastMsg = output.messages[output.messages.length - 1];
              const content = typeof lastMsg.content === "string" ? lastMsg.content : "";
              if (content) {
                try {
                  writerContent = parseWriterContent(content);
                } catch (e) {
                  console.error("Failed to parse writer content for HITL:", e);
                }
              }
            }

            if (writerContent) {
              const writerAskUser = {
                type: "ask_user",
                question: "文案已生成，是否继续？",
                options: [
                  { id: "approve", label: "继续" },
                  { id: "reject", label: "重生成（给建议）" },
                ],
                selectionType: "single",
                allowCustomInput: true,
                context: { __hitl: true, kind: "content", data: writerContent },
                threadId,
                timestamp: Date.now(),
                content: "文案已生成，等待确认",
              };
              res.write(`data: ${JSON.stringify(writerAskUser)}\n\n`);
              res.write(`data: ${JSON.stringify({ type: "workflow_paused", threadId, timestamp: Date.now(), content: "工作流已暂停，等待用户确认" })}\n\n`);
              // 保存 assistant 消息
              await saveAssistantMessages(writerAskUser);
              await flushLangfuse();
              res.end();
              return;
            }
          }
          if (nodeName === "image_planner_agent" && imagePlans.length > 0) {
            const imagePlanAskUser = {
              type: "ask_user",
              question: "图片规划已生成，是否继续生成图片？",
              options: [
                { id: "approve", label: "继续" },
                { id: "reject", label: "重规划（给建议）" },
              ],
              selectionType: "single",
              allowCustomInput: true,
              context: { __hitl: true, kind: "image_plans", data: { plans: imagePlans } },
              threadId,
              timestamp: Date.now(),
              content: "图片规划已生成，等待确认",
            };
            res.write(`data: ${JSON.stringify(imagePlanAskUser)}\n\n`);
            res.write(`data: ${JSON.stringify({ type: "workflow_paused", threadId, timestamp: Date.now(), content: "工作流已暂停，等待用户确认" })}\n\n`);
            // 保存 assistant 消息
            await saveAssistantMessages(imagePlanAskUser);
            await flushLangfuse();
            res.end();
            return;
          }
        }

        lastNodeName = nodeName;
      }
    }

    // 发送最终的完整创作内容（供前端渲染最终结果卡片）
    if (writerContent || generatedAssetIds.length > 0) {
      // 如果有 writerContent，更新 creative 记录
      if (writerContent && creativeId) {
        try {
          await updateCreative({
            id: creativeId,
            title: writerContent.title,
            content: writerContent.body,
            tags: writerContent.tags.join(', '),
          });
          console.log(`[stream] Updated creative ${creativeId} with title, content, tags`);
        } catch (error) {
          console.error(`[stream] Failed to update creative ${creativeId}:`, error);
        }
      }

      sendEvent({
        type: "workflow_complete",
        content: writerContent ? `标题: ${writerContent.title}\n\n${writerContent.body}\n\n标签: ${writerContent.tags.map(t => `#${t}`).join(' ')}` : "",
        title: writerContent?.title || "",
        body: writerContent?.body || "",
        tags: writerContent?.tags || [],
        imageAssetIds: generatedAssetIds,
        creativeId,
        timestamp: Date.now(),
      } as any);
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
