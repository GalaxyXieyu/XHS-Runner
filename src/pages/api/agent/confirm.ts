import { NextApiRequest, NextApiResponse } from "next";
import { resumeWorkflow } from "@/server/agents/multiAgentSystem";
import {
  ImagePlan,
  AgentEvent,
  LayoutSpec,
  ParagraphImageBinding,
  TextOverlayPlan,
} from "@/server/agents/state/agentState";
import { db, schema } from "@/server/db";
import { conversations, conversationMessages } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { UserResponse } from "@/server/agents/tools/askUserTool";
import { processAgentStream } from "@/server/agents/utils/streamProcessor";
import { getCheckpointer } from "@/server/agents/utils";
import { flushLangfuse } from "@/server/services/langfuseService";
import { registerProgressCallback, unregisterProgressCallback } from "@/server/agents/utils/progressEmitter";
import { writeRunArtifacts } from "@/server/agents/utils/runArtifacts";

interface ConfirmRequest {
  threadId: string;
  action: "approve" | "reject" | "modify";
  modifiedData?:
    | ImagePlan[]
    | { title: string; body: string; tags: string[] }
    | {
        imagePlans?: ImagePlan[];
        layoutSpec?: LayoutSpec[];
        paragraphImageBindings?: ParagraphImageBinding[];
        textOverlayPlan?: TextOverlayPlan[];
      };
  userFeedback?: string;
  saveAsTemplate?: {
    name: string;
    category: "image_style" | "writing_tone" | "content_structure";
    tags?: string[];
  };
  // askUser 响应
  userResponse?: UserResponse;
}

// 发送 SSE 事件（与 stream.ts 格式一致）
function sendEvent(res: NextApiResponse, event: AgentEvent, collectedEvents?: any[]) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }
  // 收集事件用于持久化
  if (collectedEvents) {
    collectedEvents.push(event);
  }
}

function ensureSSEHeaders(res: NextApiResponse) {
  if (res.headersSent) return;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function startHeartbeat(res: NextApiResponse): () => void {
  const timer = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(timer);
      return;
    }

    // SSE 注释心跳，前端不会渲染成业务事件。
    res.write(": keep-alive " + Date.now() + "\n\n");
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  }, 5000);

  return () => clearInterval(timer);
}

// 根据 threadId 查找 conversation
async function findConversationByThreadId(threadId: string): Promise<number | undefined> {
  try {
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.threadId, threadId))
      .limit(1);
    return conversation?.id;
  } catch (err) {
    console.error('Failed to find conversation:', err);
    return undefined;
  }
}

// 保存用户响应消息
async function saveUserMessage(
  conversationId: number,
  content: string,
  askUserResponse?: { selectedIds: string[]; selectedLabels: string[]; customInput?: string }
) {
  try {
    await db.insert(conversationMessages).values({
      conversationId,
      role: 'user',
      content,
      askUserResponse: askUserResponse || null,
    });
    await db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error('Failed to save user message:', err);
  }
}

// 保存 assistant 消息
async function saveAssistantMessage(
  conversationId: number,
  collectedEvents: any[],
  askUser?: any
) {
  try {
    const messageEvents = collectedEvents.filter(e => e.type === 'message' && e.content);
    const content = messageEvents.map(e => e.content).join('\n\n') || '处理完成';
    const lastAgent = messageEvents[messageEvents.length - 1]?.agent;
    
    await db.insert(conversationMessages).values({
      conversationId,
      role: 'assistant',
      content,
      agent: lastAgent || null,
      askUser: askUser || null,
      events: collectedEvents.length > 0 ? collectedEvents : null,
    });
    await db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error('Failed to save assistant message:', err);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let stopHeartbeat: (() => void) | null = null;
  const ensureHeartbeat = () => {
    if (stopHeartbeat) return;
    stopHeartbeat = startHeartbeat(res);
  };
  const clearHeartbeat = () => {
    if (!stopHeartbeat) return;
    stopHeartbeat();
    stopHeartbeat = null;
  };

  let flushConfirmArtifacts: ((status: "completed" | "failed", errorMessage?: string) => Promise<void>) | null = null;

  try {
    const { threadId, action, modifiedData, userFeedback, saveAsTemplate, userResponse } = req.body as ConfirmRequest;

    console.log("[/api/agent/confirm] 收到请求:", {
      threadId,
      type: userResponse ? 'askUser响应' : `action:${action}`,
    });

    if (!threadId) {
      return res.status(400).json({ error: "threadId is required" });
    }

    const collectedEvents: any[] = [];

    flushConfirmArtifacts = async (status: "completed" | "failed", errorMessage?: string) => {
      try {
        await writeRunArtifacts({
          runId: `${threadId}__confirm__${Date.now()}`,
          conversationId,
          message: `confirm:${userResponse ? "ask_user" : action}`,
          status,
          collectedEvents,
          errorMessage,
        });
      } catch (e) {
        console.warn("[/api/agent/confirm] Failed to write run artifacts", e);
      }
    };

    const checkpointStatePromise = (async () => {
      try {
        const checkpointer = await getCheckpointer();
        const checkpoint = await checkpointer.get({ configurable: { thread_id: threadId } });
        const stateCreativeId = checkpoint?.channel_values?.creativeId;
        const stateGeneratedContent = checkpoint?.channel_values?.generatedContent;

        const parsedGeneratedContent = stateGeneratedContent && typeof stateGeneratedContent === "object"
          ? (stateGeneratedContent as { title: string; body: string; tags: string[] })
          : null;

        return {
          creativeId: typeof stateCreativeId === "number" ? stateCreativeId : undefined,
          previousGeneratedContent: parsedGeneratedContent,
        };
      } catch (error) {
        console.warn("[/api/agent/confirm] Failed to read checkpoint:", error);
        return {
          creativeId: undefined,
          previousGeneratedContent: null,
        };
      }
    })();

    const [conversationId, checkpointState] = await Promise.all([
      findConversationByThreadId(threadId),
      checkpointStatePromise,
    ]);

    let creativeId: number | undefined = checkpointState.creativeId;
    let previousGeneratedContent: { title: string; body: string; tags: string[] } | null = checkpointState.previousGeneratedContent;
    let imageAgentStarted = false;

    if (previousGeneratedContent) {
      console.log("[/api/agent/confirm] 从 checkpoint 读取 generatedContent:", previousGeneratedContent.title?.slice(0, 50));
    }

    // 注册图片进度回调
    const sendImageProgress = (taskId: number, status: string, progress: number, url?: string, errorMessage?: string) => {
      if (!imageAgentStarted) {
        imageAgentStarted = true;
        sendEvent(res, {
          type: "agent_start",
          agent: "image_agent",
          content: "图片生成 开始工作...",
          timestamp: Date.now(),
        } as any, collectedEvents);
      }

      sendEvent(res, {
        type: "image_progress",
        taskId,
        status,
        progress,
        url,
        errorMessage,
        timestamp: Date.now(),
      } as any, collectedEvents);
    };

    registerProgressCallback(threadId, (event) => {
      sendImageProgress(
        event.taskId,
        event.status,
        event.progress,
        event.assetId ? String(event.assetId) : event.url,
        event.errorMessage
      );
    });

    // 清理函数
    const cleanup = () => {
      unregisterProgressCallback(threadId);
      clearHeartbeat();
    };
    res.on('close', cleanup);

    // 如果是 askUser 响应，直接用 userResponse 恢复
    if (userResponse) {
      console.log("[/api/agent/confirm] 处理 askUser 响应");

      ensureSSEHeaders(res);
      ensureHeartbeat();
      sendEvent(res, {
        type: "agent_start",
        agent: "supervisor",
        content: "已收到你的确认，正在恢复流程...",
        timestamp: Date.now(),
      }, collectedEvents);

      // 保存用户响应消息
      if (conversationId) {
        const userContent = userResponse.customInput ||
          userResponse.selectedIds?.join(', ') ||
          '已确认';
        await saveUserMessage(conversationId, userContent, {
          selectedIds: userResponse.selectedIds || [],
          selectedLabels: userResponse.selectedIds || [], // 简化处理
          customInput: userResponse.customInput,
        });
      }

      const stream = await resumeWorkflow(threadId, userResponse);

      console.log("[/api/agent/confirm] 开始处理 askUser 流");
      // 使用 processAgentStream 处理 LangGraph 流
      let lastAskUser: any = null;
      for await (const event of processAgentStream(stream, { threadId, enableHITL: true, creativeId, previousGeneratedContent })) {
        if (event.type === "agent_start" && event.agent === "image_agent") {
          if (imageAgentStarted) {
            continue;
          }
          imageAgentStarted = true;
        }

        sendEvent(res, event, collectedEvents);
        // 捕获 ask_user 事件
        if (event.type === 'ask_user') {
          lastAskUser = event;
        }
      }

      // 保存 assistant 消息
      if (conversationId) {
        await saveAssistantMessage(conversationId, collectedEvents, lastAskUser);
      }

      console.log("[/api/agent/confirm] askUser 流处理完成");
      if (lastAskUser) {
        console.log("[/api/agent/confirm] 流程再次暂停，保持等待用户确认状态");
        clearHeartbeat();
        await flushLangfuse();
        res.end();
        return;
      }

      res.write(`data: [DONE]\n\n`);
      clearHeartbeat();
      await flushConfirmArtifacts?.("completed");
      await flushLangfuse();
      res.end();
      return;
    }

    if (!action || !["approve", "reject", "modify"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    if (action === "reject" && !userFeedback) {
      return res.status(400).json({ error: "userFeedback is required for reject action" });
    }

    console.log("[/api/agent/confirm] 处理 action:", action);

    ensureSSEHeaders(res);
    ensureHeartbeat();
    sendEvent(res, {
      type: "agent_start",
      agent: "supervisor",
      content: "已收到你的确认，正在恢复流程...",
      timestamp: Date.now(),
    }, collectedEvents);

    // 保存为模板（如果请求）
    if (saveAsTemplate && modifiedData) {
      await db.insert(schema.promptProfiles).values({
        name: saveAsTemplate.name,
        category: saveAsTemplate.category,
        systemPrompt: JSON.stringify(modifiedData),
        userTemplate: "",
        isTemplate: true,
        tags: saveAsTemplate.tags || [],
      });
    }

    // 保存用户响应消息
    if (conversationId) {
      let userContent = '';
      let askUserResponse: any = null;
      
      switch (action) {
        case "approve":
          userContent = '继续';
          askUserResponse = { selectedIds: ['approve'], selectedLabels: ['继续'] };
          break;
        case "modify":
          userContent = '修改后继续';
          askUserResponse = { selectedIds: ['modify'], selectedLabels: ['修改后继续'] };
          break;
        case "reject":
          userContent = userFeedback || '重新生成';
          askUserResponse = { selectedIds: ['reject'], selectedLabels: ['重生成'], customInput: userFeedback };
          break;
      }
      
      await saveUserMessage(conversationId, userContent, askUserResponse);
    }


    const normalizeModifiedState = () => {
      if (!modifiedData) return undefined;
      if (Array.isArray(modifiedData)) {
        return { imagePlans: modifiedData as ImagePlan[] };
      }
      const data = modifiedData as any;
      const nextState: Record<string, unknown> = {};
      if (typeof data.title === "string" || typeof data.body === "string") {
        nextState.generatedContent = {
          title: String(data.title || ""),
          body: String(data.body || ""),
          tags: Array.isArray(data.tags) ? data.tags : [],
        };
        nextState.contentComplete = !!String(data.body || "").trim();
      }
      if (Array.isArray(data.imagePlans)) nextState.imagePlans = data.imagePlans;
      if (Array.isArray(data.layoutSpec)) nextState.layoutSpec = data.layoutSpec;
      if (Array.isArray(data.paragraphImageBindings)) nextState.paragraphImageBindings = data.paragraphImageBindings;
      if (Array.isArray(data.textOverlayPlan)) nextState.textOverlayPlan = data.textOverlayPlan;
      return Object.keys(nextState).length > 0 ? nextState : undefined;
    };

    // 根据 action 处理
    let stream;
    switch (action) {
      case "approve":
        // 直接继续执行
        console.log("[/api/agent/confirm] 用户批准，恢复工作流");
        stream = await resumeWorkflow(threadId, normalizeModifiedState());
        break;

      case "modify":
        // 用户手动修改后继续
        console.log("[/api/agent/confirm] 用户修改后继续");
        stream = await resumeWorkflow(threadId, normalizeModifiedState());
        break;

      case "reject":
        // 用户不满意，带反馈重新生成
        console.log("[/api/agent/confirm] 用户拒绝，重新生成，反馈:", userFeedback);
        stream = await resumeWorkflow(threadId, undefined, userFeedback);
        break;
    }

    console.log("[/api/agent/confirm] 开始处理流");
    // 使用 processAgentStream 处理 LangGraph 流
    let lastAskUser: any = null;
    for await (const event of processAgentStream(stream, { threadId, enableHITL: true, creativeId, previousGeneratedContent })) {
      if (event.type === "agent_start" && event.agent === "image_agent") {
        if (imageAgentStarted) {
          continue;
        }
        imageAgentStarted = true;
      }

      sendEvent(res, event, collectedEvents);
      // 捕获 ask_user 事件
      if (event.type === 'ask_user') {
        lastAskUser = event;
      }
    }

    // 保存 assistant 消息
    if (conversationId) {
      await saveAssistantMessage(conversationId, collectedEvents, lastAskUser);
      
      // 如果没有暂停（流正常结束），更新对话状态为完成
      if (!lastAskUser) {
        await db.update(conversations)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      }
    }

    console.log("[/api/agent/confirm] 流处理完成");
    if (lastAskUser) {
      console.log("[/api/agent/confirm] 流程再次暂停，保持等待用户确认状态");
      clearHeartbeat();
      await flushLangfuse();
      res.end();
      return;
    }

    res.write(`data: [DONE]\n\n`);
    clearHeartbeat();
    await flushConfirmArtifacts?.("completed");
    await flushLangfuse();
    res.end();
  } catch (error) {
    console.error("[/api/agent/confirm] Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    if (!res.headersSent) {
      clearHeartbeat();
      await flushConfirmArtifacts?.("failed", errorMessage);
      res.status(500).json({ error: errorMessage });
      return;
    }

    sendEvent(res, {
      type: "message",
      agent: "supervisor",
      content: `恢复失败：${errorMessage}`,
      timestamp: Date.now(),
    } as any);
    res.write(`data: [DONE]\n\n`);
    clearHeartbeat();
    await flushConfirmArtifacts?.("failed", errorMessage);
    await flushLangfuse();
    res.end();
  }
}
