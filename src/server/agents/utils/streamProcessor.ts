import { INTERRUPT } from "@langchain/langgraph";
import type { AgentEvent } from "@/server/agents/state/agentState";
import type { AskUserInterrupt } from "@/server/agents/tools/askUserTool";
import { logSpan, logGeneration } from "@/server/services/langfuseService";
import { createCreative } from "@/server/services/xhs/data/creativeService";
import { logAgent } from "@/server/agents/utils";
import type { AgentType } from "@/server/agents/state/agentState";

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
    research_agent: "研究专家",
    writer_agent: "创作专家",
    style_analyzer_agent: "风格分析专家",
    image_planner_agent: "图片规划专家",
    image_agent: "图片生成专家",
    review_agent: "审核专家",
  };
  return names[name] || name;
}

export interface StreamProcessorOptions {
  themeId?: number;
  traceId?: string;
  trajId?: string;
  threadId?: string;
  enableHITL?: boolean;
  onCreativeCreated?: (creativeId: number) => void;
  onImagePlansExtracted?: (plans: any[]) => void;
}

/**
 * 处理 LangGraph 流，转换为 AgentEvent 流
 * 这是一个异步生成器，可以被 for await...of 迭代
 */
export async function* processAgentStream(
  stream: AsyncIterable<any>,
  options: StreamProcessorOptions = {}
): AsyncGenerator<AgentEvent, void, unknown> {
  const { themeId, traceId, trajId, threadId, enableHITL, onCreativeCreated, onImagePlansExtracted } = options;

  let writerContent: { title: string; body: string; tags: string[] } | null = null;
  let imagePlans: any[] = [];

  console.log("[processAgentStream] 开始处理流, enableHITL:", enableHITL);

  for await (const chunk of stream) {
    console.log("[processAgentStream] 收到 chunk, keys:", Object.keys(chunk));

    // 检查是否有 interrupt (askUser 工具触发)
    if (chunk && typeof chunk === "object" && INTERRUPT in chunk) {
      console.log("[processAgentStream] 检测到 INTERRUPT");
      const chunkWithInterrupt = chunk as { [INTERRUPT]: Array<{ value: unknown }> };
      const interrupts = chunkWithInterrupt[INTERRUPT];
      const interruptData = interrupts?.[0];

      console.log("[processAgentStream] interrupt 数据:", JSON.stringify(interruptData, null, 2));

      if (interruptData?.value && typeof interruptData.value === "object" && (interruptData.value as AskUserInterrupt).type === "ask_user") {
        console.log("[processAgentStream] 这是 ask_user interrupt，暂停流");
        const askUserData = interruptData.value as AskUserInterrupt;
        yield {
          type: "ask_user",
          question: askUserData.question,
          options: askUserData.options,
          selectionType: askUserData.selectionType,
          allowCustomInput: askUserData.allowCustomInput,
          context: askUserData.context,
          threadId: threadId!,
          timestamp: askUserData.timestamp,
          content: askUserData.question,
        } as any;

        yield {
          type: "workflow_paused",
          threadId: threadId!,
          timestamp: Date.now(),
          content: "工作流已暂停，等待用户响应",
        } as any;

        return; // 停止处理，等待用户响应
      } else {
        console.log("[processAgentStream] 这不是 ask_user interrupt，继续处理");
      }
    }

    // 遍历节点输出
    for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
      if (nodeName === "__start__" || nodeName === "__end__") continue;
      if (nodeName === "supervisor_with_style") continue; // 跳过内部节点
      if (nodeName === "__interrupt__") continue; // 跳过 interrupt 标记（interruptAfter 产生）

      console.log("[processAgentStream] 处理节点:", nodeName);

      const output = nodeOutput as any;
      const nodeStartTime = new Date();

      yield {
        type: "agent_start",
        agent: nodeName,
        content: `${getAgentDisplayName(nodeName)} 开始工作...`,
        timestamp: Date.now(),
      };

      if (output.messages) {
        console.log(`[processAgentStream] ${nodeName} 有 ${output.messages.length} 条消息`);
        // 收集工具调用信息（用于后续关联）
        const toolCallsMap = new Map<string, any>();

        for (const msg of output.messages) {
          if (msg.tool_calls?.length) {
            for (const tc of msg.tool_calls) {
              toolCallsMap.set(tc.id || tc.name, tc.args);

              yield {
                type: "tool_call",
                agent: nodeName,
                tool: tc.name,
                content: `调用工具: ${tc.name}`,
                timestamp: Date.now(),
              };
            }
          }

          if (msg.name && msg.content) {
            yield {
              type: "tool_result",
              agent: nodeName,
              tool: msg.name,
              content: `${msg.name} 返回结果`,
              timestamp: Date.now(),
            };

            // 记录完整的工具调用到 Langfuse（input + output）
            if (traceId) {
              const toolInput = toolCallsMap.get(msg.tool_call_id) || toolCallsMap.get(msg.name) || {};
              await logSpan({
                traceId,
                name: `tool:${msg.name}`,
                input: toolInput,
                output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
                metadata: { agent: nodeName },
              });
            }
          }

          if (msg.content && typeof msg.content === "string" && !msg.name) {
            console.log(`[processAgentStream] ${nodeName} 消息内容 (前100字符):`, msg.content.slice(0, 100));
            // 跳过包含内部路由信息的消息
            if (nodeName === "supervisor" || msg.content.includes("NEXT:") || msg.content.includes("REASON:")) continue;

            yield {
              type: "message",
              agent: nodeName,
              content: msg.content,
              timestamp: Date.now(),
            };

            if (traceId) {
              await logGeneration({
                traceId,
                name: nodeName,
                model: 'configured-model',
                input: { agent: nodeName },
                output: msg.content,
                startTime: nodeStartTime,
                endTime: new Date(),
              });
            }

            // 保存 writer_agent 生成的内容到数据库
            if (nodeName === "writer_agent" && themeId) {
              try {
                const parsed = parseWriterContent(msg.content);
                writerContent = parsed; // 保存用于 HITL
                const creative = await createCreative({
                  themeId,
                  title: parsed.title,
                  content: parsed.body,
                  tags: parsed.tags.join(","),
                  status: "draft",
                  model: "agent",
                  prompt: "", // 这里可以传入原始 prompt
                });
                if (onCreativeCreated) {
                  onCreativeCreated(creative.id);
                }
              } catch (saveError) {
                console.error("Failed to save creative:", saveError);
              }
            }

            // 捕获 image_planner_agent 的输出用于 HITL
            if (nodeName === "image_planner_agent") {
              console.log("[processAgentStream] 捕获 image_planner_agent 输出");
              try {
                const planMatch = msg.content.match(/```json\s*([\s\S]*?)\s*```/);
                console.log("[processAgentStream] planMatch:", !!planMatch);
                if (planMatch) {
                  console.log("[processAgentStream] 提取的 JSON:", planMatch[1].slice(0, 200));
                  imagePlans = JSON.parse(planMatch[1]);
                  console.log("[processAgentStream] 解析成功, imagePlans 数量:", imagePlans.length);
                  if (onImagePlansExtracted) {
                    onImagePlansExtracted(imagePlans);
                  }
                } else {
                  console.log("[processAgentStream] 未找到 JSON 代码块，消息内容 (前500字符):", msg.content.slice(0, 500));
                }
              } catch (e) {
                console.error("Failed to parse image plans:", e);
              }
            }
          }
        }
      }

      yield {
        type: "agent_end",
        agent: nodeName,
        content: `${getAgentDisplayName(nodeName)} 完成`,
        timestamp: Date.now(),
      };

      // 记录 agent 执行结果
      if (trajId && nodeName !== "supervisor" && nodeName !== "supervisor_route") {
        const summary = output.messages?.[0]?.content?.slice?.(0, 500) || "completed";
        logAgent(trajId, nodeName as AgentType, true, typeof summary === "string" ? summary : "completed");
      }

      // HITL: 在 writer_agent 或 image_planner_agent 完成后发送确认请求
      if (enableHITL && threadId) {
        console.log("[processAgentStream] 检查 HITL, nodeName:", nodeName);

        if (nodeName === "writer_agent") {
          console.log("[processAgentStream] writer_agent 完成，检查是否需要确认");
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
            console.log("[processAgentStream] 发送 writer 确认请求");
            yield {
              type: "confirmation_required",
              confirmationType: "content",
              data: writerContent,
              threadId,
              timestamp: Date.now(),
              content: "需要确认创作内容",
            } as any;

            yield {
              type: "workflow_paused",
              threadId,
              timestamp: Date.now(),
              content: "工作流已暂停，等待内容确认",
            } as any;

            console.log("[processAgentStream] writer 确认请求已发送，停止处理");
            return; // 停止处理，等待用户确认
          }
        }

        if (nodeName === "image_planner_agent" && imagePlans.length > 0) {
          console.log("[processAgentStream] image_planner_agent 完成，发送确认请求, imagePlans:", imagePlans.length);
          yield {
            type: "confirmation_required",
            confirmationType: "image_plans",
            data: imagePlans,
            threadId,
            timestamp: Date.now(),
            content: "需要确认图片规划",
          } as any;

          yield {
            type: "workflow_paused",
            threadId,
            timestamp: Date.now(),
            content: "工作流已暂停，等待图片规划确认",
          } as any;

          console.log("[processAgentStream] image_planner 确认请求已发送，停止处理");
          return; // 停止处理，等待用户确认
        }
      }
    }
  }
}
