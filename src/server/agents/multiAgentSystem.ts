import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { supabase } from "../supabase";
import { getTagStats, getTopTitles, getLatestTrendReport } from "../services/xhs/analytics/insightService";
import { enqueueTask } from "../services/xhs/llm/generationQueue";

// 获取 LLM 配置
async function getLLMConfig() {
  const { data } = await supabase
    .from("llm_providers")
    .select("base_url, api_key, model_name")
    .eq("is_default", true)
    .eq("is_enabled", true)
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
      return JSON.stringify({ error: "No trend report found for this theme" });
    }
    return JSON.stringify({
      stats: report.stats,
      analysis: report.analysis,
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
    const task = await enqueueTask({ prompt: finalPrompt });
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
});

// 研究工具
const researchTools = [searchNotesTool, analyzeTagsTool, getTopTitlesTool, getTrendReportTool];
const imageTools = [generateImageTool];

// 创建多 Agent 系统
export async function createMultiAgentSystem() {
  const config = await getLLMConfig();

  const model = new ChatOpenAI({
    configuration: { baseURL: config.baseUrl },
    apiKey: config.apiKey,
    modelName: config.model,
    temperature: 0.7,
  });

  // Supervisor 节点 - 决定下一步
  const supervisorNode = async (state: typeof AgentState.State) => {
    const systemPrompt = `你是小红书内容创作团队的主管。根据当前状态决定下一步：

可用的专家：
- research_agent: 研究专家，负责搜索笔记、分析标签、研究爆款标题
- writer_agent: 创作专家，负责基于研究结果创作标题和正文
- image_agent: 图片专家，负责生成封面图

工作流程：
1. 如果还没有研究数据，先派 research_agent 去研究
2. 研究完成后，派 writer_agent 创作内容
3. 内容创作完成后，询问用户是否需要生成图片
4. 如果用户需要图片，派 image_agent 生成

当前状态：
- 研究完成: ${state.researchComplete}
- 内容完成: ${state.contentComplete}

请回复你的决定，格式：
NEXT: [agent_name] 或 NEXT: END
REASON: [简短说明原因]`;

    const response = await model.invoke([
      new HumanMessage(systemPrompt),
      ...state.messages.slice(-5),
    ]);

    return { messages: [response] };
  };

  // Research Agent 节点
  const researchAgentNode = async (state: typeof AgentState.State) => {
    const modelWithTools = model.bindTools(researchTools);

    const systemPrompt = `你是小红书内容研究专家。你的职责是：
1. 搜索相关笔记获取灵感
2. 分析热门标签了解趋势
3. 研究爆款标题的写作技巧

请使用工具进行研究，完成后总结发现的关键信息。`;

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
    const systemPrompt = `你是小红书爆款内容创作专家。基于之前的研究结果创作内容：

输出格式：
📌 标题：[吸引眼球的标题，15-25字，包含热门关键词]
📝 正文：[分段清晰、包含emoji、有价值的内容，300-500字]
🏷️ 标签：[5-10个相关标签]

创作要求：
- 标题要有吸引力，使用数字、疑问句或情感词
- 正文要有干货，分点阐述，适当使用emoji
- 标签要覆盖热门词和长尾词`;

    const response = await model.invoke([
      new HumanMessage(systemPrompt),
      ...state.messages.slice(-15),
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

    const systemPrompt = `你是小红书封面图设计专家。根据之前创作的内容生成合适的封面图：

要求：
- 提示词要具体描述画面内容
- 选择合适的风格（realistic/illustration/minimalist）
- 确保图片适合小红书封面展示`;

    const response = await modelWithTools.invoke([
      new HumanMessage(systemPrompt),
      ...state.messages.slice(-10),
    ]);

    return {
      messages: [response],
      currentAgent: "image_agent" as AgentType,
    };
  };

  // Tool 节点
  const researchToolNode = new ToolNode(researchTools);
  const imageToolNode = new ToolNode(imageTools);

  // 路由函数
  const routeFromSupervisor = (state: typeof AgentState.State): string => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = typeof lastMessage.content === "string" ? lastMessage.content : "";

    if (content.includes("NEXT: research_agent")) return "research_agent";
    if (content.includes("NEXT: writer_agent")) return "writer_agent";
    if (content.includes("NEXT: image_agent")) return "image_agent";
    if (content.includes("NEXT: END")) return END;

    // 默认流程
    if (!state.researchComplete) return "research_agent";
    if (!state.contentComplete) return "writer_agent";
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
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
      return "image_tools";
    }
    return "supervisor";
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
      supervisor: "supervisor",
    })
    .addEdge("image_tools", "image_agent");

  return workflow.compile();
}

// Agent 执行事件类型
export interface AgentEvent {
  type: "agent_start" | "agent_end" | "tool_call" | "tool_result" | "message";
  agent?: string;
  tool?: string;
  content: string;
  timestamp: number;
}
