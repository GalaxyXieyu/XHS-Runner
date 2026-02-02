import { NextApiRequest, NextApiResponse } from "next";
import { resumeWorkflow } from "@/server/agents/multiAgentSystem";
import { ImagePlan, AgentEvent } from "@/server/agents/state/agentState";
import { db, schema } from "@/server/db";
import type { UserResponse } from "@/server/agents/tools/askUserTool";
import { processAgentStream } from "@/server/agents/utils/streamProcessor";
import { getCheckpointer } from "@/server/agents/utils";
import { flushLangfuse } from "@/server/services/langfuseService";

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
function sendEvent(res: NextApiResponse, event: AgentEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
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

    // 如果是 askUser 响应，直接用 userResponse 恢复
    if (userResponse) {
      console.log("[/api/agent/confirm] 处理 askUser 响应");
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
      });

      console.log("[/api/agent/confirm] 开始处理 askUser 流");
      // 使用 processAgentStream 处理 LangGraph 流
      for await (const event of processAgentStream(stream, { threadId, enableHITL: true, creativeId })) {
        sendEvent(res, event);
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
    });

    console.log("[/api/agent/confirm] 开始处理流");
    // 使用 processAgentStream 处理 LangGraph 流
    for await (const event of processAgentStream(stream, { threadId, enableHITL: true, creativeId })) {
      sendEvent(res, event);
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
