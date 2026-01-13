import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { xhsTools } from "./tools";
import { supabase } from "../supabase";

// Agent 状态定义
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  themeId: Annotation<number | undefined>(),
  userRequirement: Annotation<string | undefined>(),
});

// 获取默认 LLM 配置
async function getDefaultLLMConfig() {
  const { data } = await supabase
    .from("llm_providers")
    .select("base_url, api_key, model_name")
    .eq("is_default", true)
    .eq("is_enabled", true)
    .maybeSingle();

  if (data?.base_url && data?.api_key && data?.model_name) {
    return {
      baseUrl: data.base_url,
      apiKey: data.api_key,
      model: data.model_name,
    };
  }

  // 回退到环境变量
  return {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

// 创建 Agent 节点
async function agentNode(state: typeof AgentState.State) {
  const config = await getDefaultLLMConfig();

  const model = new ChatOpenAI({
    configuration: { baseURL: config.baseUrl },
    apiKey: config.apiKey,
    modelName: config.model,
    temperature: 0.7,
  }).bindTools(xhsTools);

  const systemPrompt = `你是一个专业的小红书内容创作助手。你的任务是帮助用户创作高质量的小红书图文内容。

你可以使用以下工具：
1. searchNotes - 搜索已抓取的笔记作为参考
2. analyzeTopTags - 分析热门标签了解趋势
3. getTrendReport - 获取趋势报告
4. getTopTitles - 获取爆款标题学习写作技巧
5. generateImage - 生成封面图

创作流程建议：
1. 先了解用户需求和主题
2. 搜索相关笔记获取灵感
3. 分析热门标签和爆款标题
4. 基于分析结果创作标题和正文
5. 最后生成封面图

输出格式要求：
- 标题：吸引眼球，包含热门关键词，15-25字
- 正文：分段清晰，包含emoji，有价值的内容
- 标签：5-10个相关标签`;

  const messages = [
    new HumanMessage(systemPrompt),
    ...state.messages,
  ];

  const response = await model.invoke(messages);
  return { messages: [response] };
}

// 判断是否继续
function shouldContinue(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
    return "tools";
  }
  return END;
}

// 构建 Graph
const toolNode = new ToolNode(xhsTools);

const workflow = new StateGraph(AgentState)
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    [END]: END,
  })
  .addEdge("tools", "agent");

export const xhsContentAgent = workflow.compile();

// 导出类型
export type XHSAgentState = typeof AgentState.State;
