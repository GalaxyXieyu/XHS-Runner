import { NextApiRequest, NextApiResponse } from "next";
import { HumanMessage } from "@langchain/core/messages";
import { createMultiAgentSystem } from "@/server/agents/multiAgentSystem";
import { processAgentStream } from "@/server/agents/utils/streamProcessor";
import { createCreative } from "@/server/services/xhs/data/creativeService";
import { db } from "@/server/db";

/**
 * POST /api/agent/run-background
 *
 * 后台运行 Agent，不需要 HITL（Human-in-the-Loop）
 * 用于 Rerun 失败的任务
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, themeId, taskId } = req.body as {
    message: string;
    themeId: number;
    taskId?: number; // 如果提供，更新现有任务状态
  };

  if (!message || !themeId) {
    return res.status(400).json({ error: "message and themeId are required" });
  }

  let creativeId: number | undefined;
  let finalTaskId = taskId;

  try {
    // 1. 创建 draft creative
    const creative = await createCreative({
      themeId,
      title: null,
      content: null,
      tags: null,
      status: "draft",
      model: "agent",
      prompt: message,
    });
    creativeId = creative.id;

    // 2. 创建或更新 generation_task 记录
    const nowIso = new Date().toISOString();

    if (finalTaskId) {
      // 更新现有任务
      await db
        .from("generation_tasks")
        .update({
          status: "running",
          error_message: null,
          creative_id: creativeId,
          updated_at: nowIso,
        })
        .eq("id", finalTaskId);
    } else {
      // 创建新任务
      const { data: taskRow, error: insertError } = await db
        .from("generation_tasks")
        .insert({
          theme_id: themeId,
          topic_id: null,
          creative_id: creativeId,
          status: "running",
          prompt: message,
          model: "agent",
          created_at: nowIso,
          updated_at: nowIso,
        } as any)
        .select("id")
        .single();

      if (insertError) throw insertError;
      finalTaskId = Number((taskRow as any).id);
    }

    // 3. 立即返回任务 ID（后台执行）
    res.status(200).json({
      taskId: finalTaskId,
      creativeId,
      status: "running",
    });

    // 4. 后台执行 Agent（不等待完成）
    runAgentInBackground({
      themeId,
      creativeId,
      taskId: finalTaskId,
      message,
    }).catch((err) => {
      console.error("[run-background] Agent 执行失败:", err);
    });
  } catch (error) {
    console.error("[run-background] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

async function runAgentInBackground(params: {
  themeId: number;
  creativeId: number;
  taskId: number;
  message: string;
}) {
  const { themeId, creativeId, taskId, message } = params;
  const TIMEOUT_MS = 480000; // 8 分钟超时

  try {
    // 创建 Agent（不启用 HITL）
    const app = await createMultiAgentSystem({ enableHITL: false });

    const initialState: any = {
      messages: [new HumanMessage(message)],
      themeId,
      creativeId,
    };

    const stream = await app.stream(initialState, { recursionLimit: 100 } as any);

    // 设置超时
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent 执行超时（${TIMEOUT_MS / 1000}秒）`)), TIMEOUT_MS)
    );

    // 处理流
    const processPromise = (async () => {
      for await (const _event of processAgentStream(stream, {
        themeId,
        creativeId,
        enableHITL: false,
      })) {
        // 后台运行，不需要处理事件
      }
    })();

    await Promise.race([processPromise, timeoutPromise]);

    // 更新任务状态为完成
    await db
      .from("generation_tasks")
      .update({
        status: "done",
        updated_at: new Date().toISOString(),
        result_json: { creativeId },
      })
      .eq("id", taskId);

    console.log(`[run-background] 任务 ${taskId} 完成`);
  } catch (err: any) {
    const errorMessage = err?.message || String(err);
    console.error(`[run-background] 任务 ${taskId} 失败:`, errorMessage);

    // 更新任务状态为失败
    await db
      .from("generation_tasks")
      .update({
        status: "failed",
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
  }
}
