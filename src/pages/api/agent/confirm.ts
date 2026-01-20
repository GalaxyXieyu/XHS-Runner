import { NextApiRequest, NextApiResponse } from "next";
import { resumeWorkflow } from "@/server/agents/multiAgentSystem";
import { ImagePlan } from "@/server/agents/state/agentState";
import { db, schema } from "@/server/db";
import type { UserResponse } from "@/server/agents/tools/askUserTool";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { threadId, action, modifiedData, userFeedback, saveAsTemplate, userResponse } = req.body as ConfirmRequest;

    if (!threadId) {
      return res.status(400).json({ error: "threadId is required" });
    }

    // 如果是 askUser 响应，直接用 userResponse 恢复
    if (userResponse) {
      const stream = await resumeWorkflow(threadId, userResponse);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      for await (const event of stream) {
        const data = JSON.stringify({
          type: "state_update",
          data: event,
          timestamp: Date.now(),
        });
        res.write(`data: ${data}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: "done", timestamp: Date.now() })}\n\n`);
      res.end();
      return;
    }

    if (!action || !["approve", "reject", "modify"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

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
        stream = await resumeWorkflow(threadId, modifiedData ? { imagePlans: modifiedData as ImagePlan[] } : undefined);
        break;

      case "modify":
        // 用户手动修改后继续
        stream = await resumeWorkflow(threadId, modifiedData ? { imagePlans: modifiedData as ImagePlan[] } : undefined);
        break;

      case "reject":
        // 用户不满意，带反馈重新生成
        if (!userFeedback) {
          return res.status(400).json({ error: "userFeedback is required for reject action" });
        }
        stream = await resumeWorkflow(threadId, undefined, userFeedback);
        break;
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // 流式返回结果
    for await (const event of stream) {
      const data = JSON.stringify({
        type: "state_update",
        data: event,
        timestamp: Date.now(),
      });
      res.write(`data: ${data}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: "done", timestamp: Date.now() })}\n\n`);
    res.end();
  } catch (error) {
    console.error("[/api/agent/confirm] Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
