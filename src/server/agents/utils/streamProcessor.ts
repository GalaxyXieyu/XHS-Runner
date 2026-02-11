import { INTERRUPT } from "@langchain/langgraph";
import type { AgentEvent } from "@/server/agents/state/agentState";
import type { AskUserInterrupt } from "@/server/agents/tools/askUserTool";
import { logSpan, logGeneration } from "@/server/services/langfuseService";
import { createCreative, updateCreative } from "@/server/services/xhs/data/creativeService";
import { logAgent, parseSupervisorDecision } from "@/server/agents/utils";
import type { AgentType } from "@/server/agents/state/agentState";
import { parseWriterContent } from "./contentParser";
import { db, schema } from "@/server/db";

// 解析 writer_agent 生成的内容已移至 contentParser.ts
// 保留此函数用于兼容 HITL 确认时解析消息内容
function parseWriterContentFallback(content: string): { title: string; body: string; tags: string[] } {
  return parseWriterContent(content);
}

function getAgentDisplayName(name: string): string {
  const names: Record<string, string> = {
    supervisor: "主管",
    supervisor_route: "任务路由",
    brief_compiler_agent: "任务梳理",
    research_evidence_agent: "证据研究",
    reference_intelligence_agent: "参考图智能",
    layout_planner_agent: "版式规划",
    writer_agent: "创作专家",
    image_planner_agent: "图片规划",
    image_agent: "图片生成",
    review_agent: "审核专家",
  };
  return names[name] || name;
}

function parseToolOutput(rawContent: unknown): unknown {
  if (typeof rawContent !== "string") return rawContent;

  const trimmed = rawContent.trim();
  if (!trimmed) return "";

  try {
    return JSON.parse(trimmed);
  } catch {
    return rawContent;
  }
}

export interface StreamProcessorOptions {
  themeId?: number;
  traceId?: string;
  trajId?: string;
  threadId?: string;
  enableHITL?: boolean;
  onCreativeCreated?: (creativeId: number) => void;
  onImagePlansExtracted?: (plans: any[]) => void;
  creativeId?: number;
  // 恢复流程时传入之前保存的内容
  previousGeneratedContent?: { title: string; body: string; tags: string[] } | null;
  onNodeOutput?: (nodeName: string, output: any) => void | Promise<void>;
}

/**
 * 处理 LangGraph 流，转换为 AgentEvent 流
 * 这是一个异步生成器，可以被 for await...of 迭代
 */
export async function* processAgentStream(
  stream: AsyncIterable<any>,
  options: StreamProcessorOptions = {}
): AsyncGenerator<AgentEvent, void, unknown> {
  const {
    themeId,
    traceId,
    trajId,
    threadId,
    enableHITL,
    onCreativeCreated,
    onImagePlansExtracted,
    creativeId,
    previousGeneratedContent,
    onNodeOutput,
  } = options;

  // 从节点输出收集 generatedContent（持久化在 state 中）
  // 如果是恢复流程，使用之前保存的内容
  let generatedContent: { title: string; body: string; tags: string[] } | null = previousGeneratedContent || null;
  let imagePlans: any[] = [];
  let generatedAssetIds: number[] = [];
  let finalCreativeId = creativeId; // 可能在流程中创建

  console.log("[processAgentStream] 开始处理流, enableHITL:", enableHITL);

  for await (const [mode, rawChunk] of stream as AsyncIterable<[string, any]>) {
    // ---- tasks 模式：节点生命周期事件（真实时间戳） ----
    if (mode === "tasks") {
      const taskEvent = rawChunk as any;
      const nodeName = taskEvent?.name;
      if (!nodeName || nodeName === "__start__" || nodeName === "__end__") continue;
      if (nodeName === "supervisor_route") continue;
      // _tools 节点不发独立生命周期，归属于父 agent
      if (nodeName.endsWith("_tools")) continue;

      if (!("result" in taskEvent)) {
        // 节点开始（LangGraph 在执行前发出）
        yield {
          type: "agent_start",
          agent: nodeName,
          content: `${getAgentDisplayName(nodeName)} 开始工作...`,
          timestamp: Date.now(),
        };
      }
      // tasks with result: 忽略，agent_end 由 updates 处理后发送
      continue;
    }

    // ---- updates 模式：节点输出数据 ----
    if (mode !== "updates") continue;

    const chunk = rawChunk;
    console.log("[processAgentStream] 收到 updates chunk, keys:", Object.keys(chunk));

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

    // 将 _tools 节点名归一化到父 agent
    const toParentAgent = (name: string) =>
      name.endsWith("_tools") ? name.slice(0, -6) : name;

    // 遍历节点输出
    for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
      if (nodeName === "__start__" || nodeName === "__end__") continue;
      if (nodeName === "supervisor_route") continue;
      if (nodeName === "__interrupt__") continue;

      const isToolsNode = nodeName.endsWith("_tools");
      const effectiveAgent = toParentAgent(nodeName);
      console.log("[processAgentStream] 处理节点:", nodeName, isToolsNode ? `(→ ${effectiveAgent})` : '');

      const output = nodeOutput as any;
      const nodeStartTime = new Date();
      if (onNodeOutput) {
        await onNodeOutput(nodeName, output);
      }

      // agent_start 已由 tasks 模式发送，此处不再手动发送

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
                agent: effectiveAgent,
                tool: tc.name,
                toolCallId: tc.id || tc.name,
                toolInput: tc.args || {},
                content: `调用工具: ${tc.name}`,
                timestamp: Date.now(),
              };
            }
          }

          if (msg.name && msg.content) {
            const parsedToolOutput = parseToolOutput(msg.content);

            yield {
              type: "tool_result",
              agent: effectiveAgent,
              tool: msg.name,
              toolCallId: msg.tool_call_id || msg.name,
              toolOutput: parsedToolOutput,
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
                metadata: { agent: effectiveAgent },
              });
            }
          }

          if (msg.content && typeof msg.content === "string" && !msg.name) {
            console.log(`[processAgentStream] ${nodeName} 消息内容 (前100字符):`, msg.content.slice(0, 100));

            if (nodeName === "supervisor") {
              const decision = parseSupervisorDecision(msg.content);
              if (decision) {
                const reason = decision.guidance || decision.contextFromPrevious || "继续流程";
                yield {
                  type: "supervisor_decision",
                  agent: "supervisor",
                  content: `NEXT: ${decision.nextAgent}`,
                  decision: decision.nextAgent,
                  reason,
                  timestamp: Date.now(),
                } as any;
              }
              continue;
            }

            // 检查是否是进度消息
            const progressMatch = msg.content.match(/^\[PROGRESS\]\s*(.+)$/);
            if (progressMatch) {
              // image_agent 的结构化进度由 image_progress 事件承载，避免重复通道。
              if (effectiveAgent === "image_agent") continue;

              yield {
                type: "progress",
                agent: effectiveAgent,
                content: progressMatch[1],
                timestamp: Date.now(),
              };
              continue;
            }

            yield {
              type: "message",
              agent: effectiveAgent,
              content: msg.content,
              timestamp: Date.now(),
            };

            if (traceId) {
              await logGeneration({
                traceId,
                name: effectiveAgent,
                model: 'configured-model',
                input: { agent: effectiveAgent },
                output: msg.content,
                startTime: nodeStartTime,
                endTime: new Date(),
              });
            }

            // 捕获 image_planner_agent 的输出用于 HITL
            if (nodeName === "image_planner_agent") {
              console.log("[processAgentStream] 捕获 image_planner_agent 输出");
              try {
                const planMatch = msg.content.match(/```json\s*([\s\S]*?)\s*```/);
                if (planMatch) {
                  const parsed = JSON.parse(planMatch[1]);
                  imagePlans = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.imagePlans) ? parsed.imagePlans : []);
                  if (onImagePlansExtracted && imagePlans.length > 0) {
                    onImagePlansExtracted(imagePlans);
                  }
                }
              } catch (e) {
                console.error("Failed to parse image plans:", e);
              }
            }
          }
        }
      }

      // 从节点输出捕获 generatedContent（writer_agent 返回）
      if (nodeName === "writer_agent" && output.generatedContent) {
        generatedContent = output.generatedContent;
        console.log("[processAgentStream] 从 writer_agent 节点输出获取 generatedContent:", generatedContent?.title?.slice(0, 50));
      }

      // 捕获 image_agent 的输出
      if (nodeName === "image_agent") {
        if (output.generatedImageAssetIds?.length > 0) {
          generatedAssetIds = output.generatedImageAssetIds;
          console.log("[processAgentStream] 从 image_agent 获取 generatedAssetIds:", generatedAssetIds.length);
        }
      }

      // _tools 节点不发独立 agent_end（归属于父 agent）
      if (!isToolsNode) {
        yield {
          type: "agent_end",
          agent: effectiveAgent,
          content: `${getAgentDisplayName(effectiveAgent)} 完成`,
          timestamp: Date.now(),
        };
      }

      // 记录 agent 执行结果
      if (trajId && nodeName !== "supervisor" && nodeName !== "supervisor_route") {
        const summary = output.messages?.[0]?.content?.slice?.(0, 500) || "completed";
        logAgent(trajId, effectiveAgent as AgentType, true, typeof summary === "string" ? summary : "completed");
      }

      // HITL: 在 writer_agent 或 image_planner_agent 完成后发送确认请求
      if (enableHITL && threadId) {
        console.log("[processAgentStream] 检查 HITL, nodeName:", nodeName);

        if (nodeName === "writer_agent") {
          // 优先 output.generatedContent，否则从消息解析
          let contentForHitl = generatedContent;
          if (!contentForHitl && output.messages?.length) {
            const lastMsg = output.messages[output.messages.length - 1];
            const raw = typeof lastMsg?.content === "string" ? lastMsg.content : "";
            if (raw) {
              try {
                contentForHitl = parseWriterContent(raw);
              } catch {
                contentForHitl = null;
              }
            }
          }
          if (!contentForHitl) continue;
          console.log("[processAgentStream] 发送 writer 确认请求（ask_user）");
          yield {
            type: "ask_user",
            question: "文案已生成，是否继续？",
            options: [
              { id: "approve", label: "继续" },
              { id: "reject", label: "重生成（给建议）" },
            ],
            selectionType: "single",
            allowCustomInput: true,
            context: { __hitl: true, kind: "content", data: contentForHitl },
            threadId,
            timestamp: Date.now(),
            content: "文案已生成，等待确认",
          } as any;
          yield {
            type: "workflow_paused",
            threadId,
            timestamp: Date.now(),
            content: "工作流已暂停，等待用户确认",
          } as any;
          return;
        }

        if (nodeName === "image_planner_agent" && imagePlans.length > 0) {
          console.log("[processAgentStream] image_planner_agent 完成，发送确认请求, imagePlans:", imagePlans.length);
          yield {
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
          } as any;

          yield {
            type: "workflow_paused",
            threadId,
            timestamp: Date.now(),
            content: "工作流已暂停，等待用户确认",
          } as any;

          console.log("[processAgentStream] image_planner 确认请求已发送，停止处理");
          return; // 停止处理，等待用户确认
        }
      }
    }
  }

  // 流处理完成，统一入库并发送 workflow_complete 事件
  console.log("[processAgentStream] 流处理完成, generatedContent:", !!generatedContent, "generatedAssetIds:", generatedAssetIds.length);

  if (generatedContent || generatedAssetIds.length > 0) {
    // 统一入库
    try {
      if (finalCreativeId) {
        // 更新现有 creative
        if (generatedContent) {
          await updateCreative({
            id: finalCreativeId,
            title: generatedContent.title,
            content: generatedContent.body,
            tags: generatedContent.tags.join(","),
            status: "draft",
            model: "agent",
            prompt: "",
          });
          console.log(`[streamProcessor] Updated creative ${finalCreativeId}`);
        }
      } else if (themeId && generatedContent) {
        // 创建新 creative
        const creative = await createCreative({
          themeId,
          title: generatedContent.title,
          content: generatedContent.body,
          tags: generatedContent.tags.join(","),
          status: "draft",
          model: "agent",
          prompt: "",
        });
        finalCreativeId = creative.id;
        console.log(`[streamProcessor] Created new creative ${creative.id}`);
        if (onCreativeCreated) {
          onCreativeCreated(creative.id);
        }
      }

      // 关联图片（如果有 creativeId 和 assetIds）
      if (finalCreativeId && generatedAssetIds.length > 0) {
        for (let i = 0; i < generatedAssetIds.length; i++) {
          const assetId = generatedAssetIds[i];
          try {
            await db.insert(schema.creativeAssets).values({
              creativeId: finalCreativeId,
              assetId,
              sortOrder: i,
            });
            console.log(`[streamProcessor] Linked asset ${assetId} to creative ${finalCreativeId}`);
          } catch (linkError) {
            // 可能已存在关联，忽略
            console.warn(`[streamProcessor] Failed to link asset ${assetId}:`, linkError);
          }
        }
      }
    } catch (saveError) {
      console.error("[streamProcessor] Failed to save creative:", saveError);
    }

    // 发送 workflow_complete 事件
    console.log("[processAgentStream] 发送 workflow_complete 事件");
    yield {
      type: "workflow_complete",
      content: generatedContent ? `标题: ${generatedContent.title}\n\n${generatedContent.body}\n\n标签: ${generatedContent.tags.map(t => `#${t}`).join(' ')}` : "",
      title: generatedContent?.title || "",
      body: generatedContent?.body || "",
      tags: generatedContent?.tags || [],
      imageAssetIds: generatedAssetIds,
      creativeId: finalCreativeId,
      timestamp: Date.now(),
    } as any;
  }
}
