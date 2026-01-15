import { NextApiRequest, NextApiResponse } from "next";
import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { supabase } from "@/server/supabase";
import { getTagStats, getTopTitles, getLatestTrendReport } from "@/server/services/xhs/analytics/insightService";
import { enqueueGeneration } from "@/server/services/xhs/llm/generationQueue";
import { getAgentPrompt } from "@/server/services/xhs/llm/agentPromptService";
import { createTrace, logGeneration, logSpan, flushLangfuse } from "@/server/services/langfuseService";

// 图片生成目标数量（可配置）
const IMAGE_TARGET = 3;

// 过滤消息，移除 tool messages 和带 tool_calls 的 AI messages，只保留纯文本对话
function filterMessagesForAgent(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter((msg) => {
    if (msg instanceof ToolMessage) return false;
    if (msg instanceof AIMessage && msg.tool_calls?.length) return false;
    return true;
  });
}

// Agent 执行事件类型
interface AgentEvent {
  type: "agent_start" | "agent_end" | "tool_call" | "tool_result" | "message";
  agent?: string;
  tool?: string;
  content: string;
  timestamp: number;
}

// 获取 LLM 配置
async function getLLMConfig() {
  const { data } = await supabase
    .from("llm_providers")
    .select("base_url, api_key, model_name")
    .eq("is_default", 1)
    .eq("is_enabled", 1)
    .maybeSingle();

  if (data?.base_url && data?.api_key && data?.model_name) {
    return { baseUrl: data.base_url, apiKey: data.api_key, model: data.model_name };
  }
  return {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

// ===== Tools =====
const searchNotesTool = tool(
  async ({ query, themeId, limit = 10 }) => {
    let dbQuery = supabase
      .from("topics")
      .select("id, title, desc, like_count, collect_count, comment_count")
      .ilike("title", `%${query}%`)
      .order("like_count", { ascending: false })
      .limit(limit);
    if (themeId) dbQuery = dbQuery.eq("theme_id", themeId);
    const { data, error } = await dbQuery;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      count: data?.length || 0,
      notes: data?.map((n) => ({
        title: n.title,
        desc: (n.desc as string)?.slice(0, 200),
        likes: n.like_count,
        collects: n.collect_count,
      })),
    });
  },
  {
    name: "search_notes",
    description: "搜索已抓取的小红书笔记，根据关键词查找相关内容作为创作参考",
    schema: z.object({
      query: z.string().describe("搜索关键词"),
      themeId: z.number().optional().describe("限定主题ID"),
      limit: z.number().optional().describe("返回数量，默认10"),
    }),
  }
);

const analyzeTagsTool = tool(
  async ({ themeId, days = 7 }) => {
    const tags = await getTagStats(themeId, { days });
    return JSON.stringify({
      topTags: tags.slice(0, 15).map((t) => ({ tag: t.tag, count: t.count, weight: t.weight })),
    });
  },
  {
    name: "analyze_tags",
    description: "分析指定主题下的热门标签和互动数据，了解当前流行趋势",
    schema: z.object({
      themeId: z.number().describe("主题ID"),
      days: z.number().optional().describe("分析天数范围，默认7天"),
    }),
  }
);

const getTopTitlesTool = tool(
  async ({ themeId, limit = 20 }) => {
    const titles = await getTopTitles(themeId, limit);
    return JSON.stringify({
      titles: titles.map((t) => ({ title: t.title, likes: t.like_count, collects: t.collect_count })),
    });
  },
  {
    name: "get_top_titles",
    description: "获取指定主题下的爆款标题列表，用于学习标题写作技巧",
    schema: z.object({
      themeId: z.number().describe("主题ID"),
      limit: z.number().optional().describe("返回数量，默认20"),
    }),
  }
);

const getTrendReportTool = tool(
  async ({ themeId }) => {
    const report = await getLatestTrendReport(themeId);
    if (!report) {
      return JSON.stringify({ error: "暂无趋势报告，请先生成" });
    }
    return JSON.stringify({
      stats: report.stats,
      analysis: report.analysis,
      reportDate: report.report_date,
    });
  },
  {
    name: "get_trend_report",
    description: "获取主题的趋势报告，包含今日数据统计和AI分析",
    schema: z.object({
      themeId: z.number().describe("主题ID"),
    }),
  }
);

const generateImageTool = tool(
  async ({ prompt, style = "realistic" }) => {
    const stylePrompts: Record<string, string> = {
      realistic: "realistic photo style, high quality",
      illustration: "illustration style, colorful, artistic",
      minimalist: "minimalist design, clean, simple",
    };
    const finalPrompt = `${prompt}, ${stylePrompts[style] || stylePrompts.realistic}, suitable for xiaohongshu cover`;
    const task = await enqueueGeneration({ prompt: finalPrompt });
    return JSON.stringify({ taskId: task.id, status: "queued", message: "图片生成任务已加入队列" });
  },
  {
    name: "generate_image",
    description: "根据提示词生成小红书封面图，返回任务ID",
    schema: z.object({
      prompt: z.string().describe("图片生成提示词"),
      style: z.enum(["realistic", "illustration", "minimalist"]).optional().describe("图片风格"),
    }),
  }
);

// Agent 类型
type AgentType = "supervisor" | "research_agent" | "writer_agent" | "image_agent";

// State 定义
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    value: (x, y) => x.concat(y),
    default: () => [],
  }),
  currentAgent: Annotation<AgentType>({
    value: (_, y) => y,
    default: () => "supervisor" as AgentType,
  }),
  researchComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  contentComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  imageCount: Annotation<number>({
    value: (x, y) => x + y,
    default: () => 0,
  }),
});

// 研究工具
const researchTools = [searchNotesTool, analyzeTagsTool, getTopTitlesTool, getTrendReportTool];
const imageTools = [generateImageTool];

// 创建多 Agent 系统
async function createMultiAgentSystem() {
  const config = await getLLMConfig();

  const model = new ChatOpenAI({
    configuration: { baseURL: config.baseUrl },
    apiKey: config.apiKey,
    modelName: config.model,
    temperature: 0.7,
  });

  // Supervisor 节点
  const supervisorNode = async (state: typeof AgentState.State) => {
    const systemPrompt = await getAgentPrompt('supervisor', {
      researchComplete: state.researchComplete,
      contentComplete: state.contentComplete,
      imageCount: state.imageCount,
      imageTarget: IMAGE_TARGET,
    });

    const response = await model.invoke([
      new HumanMessage(systemPrompt),
      ...state.messages.slice(-5),
    ]);

    return { messages: [response] };
  };

  // Research Agent 节点
  const researchAgentNode = async (state: typeof AgentState.State) => {
    const modelWithTools = model.bindTools(researchTools);
    const systemPrompt = await getAgentPrompt('research_agent');

    const response = await modelWithTools.invoke([
      new HumanMessage(systemPrompt),
      ...state.messages.slice(-10),
    ]);

    return {
      messages: [response],
      currentAgent: "research_agent" as AgentType,
    };
  };

  // Writer Agent 节点
  const writerAgentNode = async (state: typeof AgentState.State) => {
    const systemPrompt = await getAgentPrompt('writer_agent');

    const filteredMessages = filterMessagesForAgent(state.messages);
    const response = await model.invoke([
      new HumanMessage(systemPrompt),
      ...filteredMessages.slice(-10),
    ]);

    return {
      messages: [response],
      currentAgent: "writer_agent" as AgentType,
      contentComplete: true,
    };
  };

  // Image Agent 节点
  const imageAgentNode = async (state: typeof AgentState.State) => {
    const modelWithTools = model.bindTools(imageTools);
    const systemPrompt = await getAgentPrompt('image_agent', {
      imageTarget: IMAGE_TARGET,
    });

    const filteredMessages = filterMessagesForAgent(state.messages);
    const response = await modelWithTools.invoke([
      new HumanMessage(systemPrompt),
      ...filteredMessages.slice(-10),
    ]);

    return {
      messages: [response],
      currentAgent: "image_agent" as AgentType,
    };
  };

  // Tool 节点
  const researchToolNode = new ToolNode(researchTools);
  const baseImageToolNode = new ToolNode(imageTools);

  // 包装 image_tools 节点以追踪生成数量
  const imageToolNode = async (state: typeof AgentState.State) => {
    const result = await baseImageToolNode.invoke(state);
    const generatedCount = result.messages?.length || 0;
    return { ...result, imageCount: generatedCount };
  };

  // 路由函数
  const routeFromSupervisor = (state: typeof AgentState.State): string => {
    // 如果已生成足够图片，直接结束
    if (state.imageCount >= IMAGE_TARGET) return END;

    const lastMessage = state.messages[state.messages.length - 1];
    const content = typeof lastMessage.content === "string" ? lastMessage.content : "";

    if (content.includes("NEXT: research_agent")) return "research_agent";
    if (content.includes("NEXT: writer_agent")) return "writer_agent";
    if (content.includes("NEXT: image_agent")) return "image_agent";
    if (content.includes("NEXT: END")) return END;

    if (!state.researchComplete) return "research_agent";
    if (!state.contentComplete) return "writer_agent";
    if (state.imageCount < IMAGE_TARGET) return "image_agent";
    return END;
  };

  const shouldContinueResearch = (state: typeof AgentState.State): string => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
      return "research_tools";
    }
    return "supervisor";
  };

  const shouldContinueImage = (state: typeof AgentState.State): string => {
    // 如果已生成足够图片，直接结束
    if (state.imageCount >= IMAGE_TARGET) return END;

    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
      return "image_tools";
    }
    // 还没生成够，继续让 image_agent 生成
    if (state.imageCount < IMAGE_TARGET) return "image_agent";
    return END;
  };

  // 构建 Graph
  const workflow = new StateGraph(AgentState)
    .addNode("supervisor", supervisorNode)
    .addNode("research_agent", researchAgentNode)
    .addNode("writer_agent", writerAgentNode)
    .addNode("image_agent", imageAgentNode)
    .addNode("research_tools", researchToolNode)
    .addNode("image_tools", imageToolNode)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", routeFromSupervisor, {
      research_agent: "research_agent",
      writer_agent: "writer_agent",
      image_agent: "image_agent",
      [END]: END,
    })
    .addConditionalEdges("research_agent", shouldContinueResearch, {
      research_tools: "research_tools",
      supervisor: "supervisor",
    })
    .addEdge("research_tools", "research_agent")
    .addEdge("writer_agent", "supervisor")
    .addConditionalEdges("image_agent", shouldContinueImage, {
      image_tools: "image_tools",
      image_agent: "image_agent",
      [END]: END,
    })
    .addConditionalEdges("image_tools", (state: typeof AgentState.State) => {
      return state.imageCount >= IMAGE_TARGET ? END : "image_agent";
    }, {
      image_agent: "image_agent",
      [END]: END,
    });

  return workflow.compile();
}

function getAgentDisplayName(name: string): string {
  const names: Record<string, string> = {
    supervisor: "主管",
    research_agent: "研究专家",
    writer_agent: "创作专家",
    image_agent: "图片专家",
  };
  return names[name] || name;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, themeId } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // 创建 Langfuse trace
  const trace = await createTrace('agent-stream', {
    message,
    themeId,
    imageTarget: IMAGE_TARGET,
  });
  const traceId = trace?.id;

  try {
    const app = await createMultiAgentSystem();

    const contextMessage = themeId
      ? `[当前主题ID: ${themeId}] ${message}`
      : message;

    const stream = await app.stream(
      { messages: [new HumanMessage(contextMessage)] },
      { recursionLimit: 50 }
    );

    for await (const chunk of stream) {
      for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
        if (nodeName === "__start__" || nodeName === "__end__") continue;

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

                // 记录工具调用到 Langfuse
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
              sendEvent({
                type: "message",
                agent: nodeName,
                content: msg.content,
                timestamp: Date.now(),
              });

              // 记录 LLM 生成到 Langfuse
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
  } catch (error: any) {
    console.error("Multi-agent error:", error);
    sendEvent({
      type: "message",
      content: `❌ 错误: ${error.message}`,
      timestamp: Date.now(),
    });
    res.end();
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
