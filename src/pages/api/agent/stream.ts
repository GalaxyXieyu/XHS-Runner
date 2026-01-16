import { NextApiRequest, NextApiResponse } from "next";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { createMultiAgentSystem, AgentEvent } from "@/server/agents/multiAgentSystem";
import { createTrace, logGeneration, logSpan, flushLangfuse } from "@/server/services/langfuseService";
import { createCreative } from "@/server/services/xhs/data/creativeService";

// 解析 writer_agent 生成的内容
function parseWriterContent(content: string): { title: string; body: string; tags: string[] } {
  const titleMatch = content.match(/(?:📌\s*)?标题[：:]\s*(.+?)(?:\n|$)/);
  const title = titleMatch?.[1]?.trim() || "AI 生成内容";

  const tagMatch = content.match(/(?:🏷️\s*)?标签[：:]\s*(.+?)(?:\n|$)/);
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
    research_agent: "研究专家",
    writer_agent: "创作专家",
    style_analyzer_agent: "风格分析专家",
    image_planner_agent: "图片规划专家",
    image_agent: "图片生成专家",
    review_agent: "审核专家",
  };
  return names[name] || name;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, themeId, referenceImageUrl } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

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
  };

  // 创建 Langfuse trace
  const trace = await createTrace('agent-stream', {
    message,
    themeId,
    hasReferenceImage: !!referenceImageUrl,
  });
  const traceId = trace?.id;

  // 用于保存 creativeId
  let creativeId: number | undefined;

  sendEvent({
    type: "agent_start",
    agent: "supervisor",
    content: referenceImageUrl ? "🚀 开始处理请求 (带参考图)..." : "🚀 开始处理请求...",
    timestamp: Date.now(),
  });

  try {
    const app = await createMultiAgentSystem();

    const contextMessage = themeId
      ? `[当前主题ID: ${themeId}] ${message}`
      : message;

    // 初始状态，包含参考图
    const initialState: any = {
      messages: [new HumanMessage(contextMessage)],
    };
    if (referenceImageUrl) {
      initialState.referenceImageUrl = referenceImageUrl;
    }

    const stream = await app.stream(initialState, { recursionLimit: 100 });

    for await (const chunk of stream) {
      console.log("[DEBUG] Stream chunk:", JSON.stringify(Object.keys(chunk)));

      for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
        console.log(`[DEBUG] Processing node: ${nodeName}`);

        if (nodeName === "__start__" || nodeName === "__end__") continue;
        if (nodeName === "supervisor_with_style") continue; // 跳过内部节点

        const output = nodeOutput as any;
        const nodeStartTime = new Date();

        sendEvent({
          type: "agent_start",
          agent: nodeName,
          content: `🤖 ${getAgentDisplayName(nodeName)} 开始工作...`,
          timestamp: Date.now(),
        });

        if (output.messages) {
          for (const msg of output.messages) {
            if (msg.tool_calls?.length) {
              for (const tc of msg.tool_calls) {
                sendEvent({
                  type: "tool_call",
                  agent: nodeName,
                  tool: tc.name,
                  content: `🔧 调用工具: ${tc.name}`,
                  timestamp: Date.now(),
                });

                await logSpan({
                  traceId,
                  name: `tool:${tc.name}`,
                  input: tc.args,
                  metadata: { agent: nodeName },
                });
              }
            }

            if (msg.name && msg.content) {
              sendEvent({
                type: "tool_result",
                agent: nodeName,
                tool: msg.name,
                content: `📊 ${msg.name} 返回结果`,
                timestamp: Date.now(),
              });
            }

            if (msg.content && typeof msg.content === "string" && !msg.name) {
              // 跳过包含内部路由信息的消息
              if (nodeName === "supervisor" || msg.content.includes("NEXT:") || msg.content.includes("REASON:")) continue;

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
                } catch (saveError) {
                  console.error("Failed to save creative:", saveError);
                }
              }
            }
          }
        }

        sendEvent({
          type: "agent_end",
          agent: nodeName,
          content: `✅ ${getAgentDisplayName(nodeName)} 完成`,
          timestamp: Date.now(),
        });
      }
    }

    res.write(`data: [DONE]\n\n`);
    await flushLangfuse();
    res.end();
  } catch (error: unknown) {
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
      content: `❌ 错误: ${errorMessage}`,
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
