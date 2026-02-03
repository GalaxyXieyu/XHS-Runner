import { NextApiRequest, NextApiResponse } from "next";
import { resumeWorkflow } from "@/server/agents/multiAgentSystem";
import { ImagePlan, AgentEvent } from "@/server/agents/state/agentState";
import { db, schema } from "@/server/db";
import { conversations, conversationMessages } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { UserResponse } from "@/server/agents/tools/askUserTool";
import { processAgentStream } from "@/server/agents/utils/streamProcessor";
import { getCheckpointer } from "@/server/agents/utils";
import { flushLangfuse } from "@/server/services/langfuseService";
import { registerProgressCallback, unregisterProgressCallback } from "@/server/agents/utils/progressEmitter";

interface ConfirmRequest {
  threadId: string;
  action: "approve" | "reject" | "modify";
  modifiedData?: ImagePlan[] | { title: string; body: string; tags: string[] };
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

  try {
    const { threadId, action, modifiedData, userFeedback, saveAsTemplate, userResponse } = req.body as ConfirmRequest;

    console.log("[/api/agent/confirm] 收到请求:", { threadId, action, hasUserResponse: !!userResponse });

    if (!threadId) {
      return res.status(400).json({ error: "threadId is required" });
    }

    // 查找对应的 conversation
    const conversationId = await findConversationByThreadId(threadId);
    const collectedEvents: any[] = [];
    
    let creativeId: number | undefined;
    try {
      const checkpointer = await getCheckpointer();
      const checkpoint = await checkpointer.get({ configurable: { thread_id: threadId } });
      const stateCreativeId = checkpoint?.channel_values?.creativeId;
      if (typeof stateCreativeId === "number") {
        creativeId = stateCreativeId;
      }
    } catch (error) {
      console.warn("[/api/agent/confirm] Failed to read checkpoint creativeId:", error);
    }

    // 注册图片进度回调
    const sendImageProgress = (taskId: number, status: string, progress: number, url?: string, errorMessage?: string) => {
      sendEvent(res, {
        type: 'image_progress',
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
    };
    res.on('close', cleanup);

    // 如果是 askUser 响应，直接用 userResponse 恢复
    if (userResponse) {
      console.log("[/api/agent/confirm] 处理 askUser 响应");
      
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
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      sendEvent(res, {
        type: "agent_start",
        agent: "supervisor",
        content: "继续处理中...",
        timestamp: Date.now(),
      }, collectedEvents);

      console.log("[/api/agent/confirm] 开始处理 askUser 流");
      // 使用 processAgentStream 处理 LangGraph 流
      let lastAskUser: any = null;
      for await (const event of processAgentStream(stream, { threadId, enableHITL: true, creativeId })) {
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
      res.write(`data: [DONE]\n\n`);
      await flushLangfuse();
      res.end();
      return;
    }

    if (!action || !["approve", "reject", "modify"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    console.log("[/api/agent/confirm] 处理 action:", action);

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

    // 根据 action 处理
    let stream;
    switch (action) {
      case "approve":
        // 直接继续执行
        console.log("[/api/agent/confirm] 用户批准，恢复工作流");
        stream = await resumeWorkflow(threadId, modifiedData ? { imagePlans: modifiedData as ImagePlan[] } : undefined);
        break;

      case "modify":
        // 用户手动修改后继续
        console.log("[/api/agent/confirm] 用户修改后继续");
        stream = await resumeWorkflow(threadId, modifiedData ? { imagePlans: modifiedData as ImagePlan[] } : undefined);
        break;

      case "reject":
        // 用户不满意，带反馈重新生成
        if (!userFeedback) {
          return res.status(400).json({ error: "userFeedback is required for reject action" });
        }
        console.log("[/api/agent/confirm] 用户拒绝，重新生成，反馈:", userFeedback);
        stream = await resumeWorkflow(threadId, undefined, userFeedback);
        break;
    }

    // 设置 SSE 响应头（与 stream.ts 和 userResponse 部分保持一致）
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    sendEvent(res, {
      type: "agent_start",
      agent: "supervisor",
      content: "继续处理中...",
      timestamp: Date.now(),
    }, collectedEvents);

    console.log("[/api/agent/confirm] 开始处理流");
    // 使用 processAgentStream 处理 LangGraph 流
    let lastAskUser: any = null;
    for await (const event of processAgentStream(stream, { threadId, enableHITL: true, creativeId })) {
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
    res.write(`data: [DONE]\n\n`);
    await flushLangfuse();
    res.end();
  } catch (error) {
    console.error("[/api/agent/confirm] Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
