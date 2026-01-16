import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { supabase } from "../supabase";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { getTagStats, getTopTitles, getLatestTrendReport } from "../services/xhs/analytics/insightService";
import { enqueueTask } from "../services/xhs/llm/generationQueue";
import { analyzeReferenceImage } from "../services/xhs/llm/geminiClient";
import { generateImageWithReference } from "../services/xhs/integration/imageProvider";
import { storeAsset } from "../services/xhs/integration/assetStore";
import * as fs from "fs";

// 过滤掉孤立的 ToolMessage（前面没有对应 tool_calls 的）
function filterOrphanedToolMessages(messages: BaseMessage[]): BaseMessage[] {
  const result: BaseMessage[] = [];
  const pendingToolCallIds = new Set<string>();

  for (const msg of messages) {
    if (msg instanceof AIMessage && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.id) pendingToolCallIds.add(tc.id);
      }
      result.push(msg);
    } else if (msg instanceof ToolMessage) {
      const toolCallId = (msg as any).tool_call_id;
      if (toolCallId && pendingToolCallIds.has(toolCallId)) {
        result.push(msg);
        pendingToolCallIds.delete(toolCallId);
      } else {
        console.log(`[filterOrphanedToolMessages] Skipping orphaned ToolMessage: ${toolCallId}`);
      }
    } else {
      result.push(msg);
    }
  }
  return result;
}

// 安全截取消息，确保不会截断工具调用对
function safeSliceMessages(messages: BaseMessage[], maxCount: number): BaseMessage[] {
  // 先过滤孤立的 ToolMessage
  const filtered = filterOrphanedToolMessages(messages);

  if (filtered.length <= maxCount) return filtered;

  // 从后往前找到安全的截取点
  let startIndex = filtered.length - maxCount;

  // 确保不会从 ToolMessage 开始
  while (startIndex < filtered.length && filtered[startIndex] instanceof ToolMessage) {
    startIndex--;
  }

  if (startIndex < 0) startIndex = 0;

  // 截取后再次过滤，确保没有孤立的 ToolMessage
  return filterOrphanedToolMessages(filtered.slice(startIndex));
}

// 获取 LLM 配置
async function getLLMConfig(requireVision = false) {
  let query = supabase
    .from("llm_providers")
    .select("base_url, api_key, model_name, max_tokens, supports_vision, supports_image_gen")
    .eq("is_enabled", 1);

  if (requireVision) {
    query = query.eq("supports_vision", true);
  } else {
    query = query.eq("is_default", 1);
  }

  const { data } = await query.maybeSingle();

  if (data?.base_url && data?.api_key && data?.model_name) {
    return { baseUrl: data.base_url, apiKey: data.api_key, model: data.model_name, maxTokens: data.max_tokens || 8192, supportsVision: !!data.supports_vision };
  }
  return {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    maxTokens: 8192,
    supportsVision: false,
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
type AgentType = "supervisor" | "research_agent" | "writer_agent" | "style_analyzer_agent" | "image_planner_agent" | "image_agent" | "review_agent";

// 风格分析结果类型
interface StyleAnalysis {
  style: string;
  colorPalette: string[];
  mood: string;
  composition: string;
  lighting: string;
  texture: string;
  description: string;
}

// 图片规划类型
interface ImagePlan {
  sequence: number;
  role: string;
  description: string;
  prompt?: string;
}

// 审核反馈类型
interface ReviewFeedback {
  approved: boolean;
  suggestions: string[];
  targetAgent?: "image_planner_agent" | "image_agent" | "writer_agent";
  optimizedPrompts?: string[];
}

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
  // 新增状态
  referenceImageUrl: Annotation<string | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  // 支持多个参考图
  referenceImages: Annotation<string[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  styleAnalysis: Annotation<StyleAnalysis | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  imagePlans: Annotation<ImagePlan[]>({
    value: (_, y) => y,
    default: () => [],
  }),
  creativeId: Annotation<number | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  // 审核相关状态
  reviewFeedback: Annotation<ReviewFeedback | null>({
    value: (_, y) => y,
    default: () => null,
  }),
  imagesComplete: Annotation<boolean>({
    value: (_, y) => y,
    default: () => false,
  }),
  // 已生成的图片数量
  generatedImageCount: Annotation<number>({
    value: (x, y) => Math.max(x, y),  // 取最大值，避免重复计数
    default: () => 0,
  }),
  // 已生成的图片路径（用于多模态审核）
  generatedImagePaths: Annotation<string[]>({
    value: (x, y) => [...x, ...y],  // 累加
    default: () => [],
  }),
  // 迭代控制
  iterationCount: Annotation<number>({
    value: (x, y) => y,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    value: (_, y) => y,
    default: () => 3,  // 最多迭代3次
  }),
  // 图片生成模型选择
  imageGenProvider: Annotation<string>({
    value: (_, y) => y,
    default: () => "gemini",
  }),
});

// 研究工具
const researchTools = [searchNotesTool, analyzeTagsTool, getTopTitlesTool, getTrendReportTool];
const imageTools = [generateImageTool];

// 风格分析工具
const analyzeStyleTool = tool(
  async ({ imageUrl }) => {
    try {
      const analysis = await analyzeReferenceImage(imageUrl);
      return JSON.stringify({ success: true, analysis });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  {
    name: "analyze_style",
    description: "分析参考图的视觉风格特征，提取风格描述用于后续图片生成",
    schema: z.object({
      imageUrl: z.string().describe("参考图 URL 或 base64 数据"),
    }),
  }
);

// 带参考图生成图片工具 (根据设置选择 jimeng 或 gemini)
const generateWithReferenceTool = tool(
  async ({ prompt, referenceImageUrl, sequence, role, provider }) => {
    try {
      console.log(`[generateWithReference] prompt: ${prompt.slice(0, 50)}...`);
      console.log(`[generateWithReference] referenceImageUrl: ${referenceImageUrl.slice(0, 50)}...`);
      console.log(`[generateWithReference] sequence: ${sequence}, role: ${role}, provider: ${provider || 'auto'}`);

      // 使用统一的带参考图生成接口
      const result = await generateImageWithReference({
        prompt,
        referenceImageUrl,
        provider: provider as 'gemini' | 'jimeng' | undefined,
      });

      console.log(`[generateWithReference] Success! imageSize: ${result.imageBuffer.length}, provider: ${result.provider}`);

      // 保存图片到文件系统
      const filename = `agent-${Date.now()}-${sequence}-${role}.png`;
      const asset = await storeAsset({
        type: 'generated_image',
        filename,
        data: result.imageBuffer,
        metadata: { sequence, role, provider: result.provider, prompt: prompt.slice(0, 200) },
      });
      console.log(`[generateWithReference] Saved to: ${asset.path}`);

      return JSON.stringify({
        success: true,
        sequence,
        role,
        imageSize: result.imageBuffer.length,
        assetId: asset.id,
        path: asset.path,
        message: `图片生成成功 (${result.provider})`,
      });
    } catch (error) {
      console.error(`[generateWithReference] Error:`, error);
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  {
    name: "generate_with_reference",
    description: "根据参考图风格生成小红书配图（支持 Gemini 或火山引擎即梦）",
    schema: z.object({
      prompt: z.string().describe("中文生图提示词"),
      referenceImageUrl: z.string().describe("参考图 URL"),
      sequence: z.number().describe("图片序号 (0=封面)"),
      role: z.enum(["cover", "step", "detail", "result", "comparison"]).describe("图片角色"),
      provider: z.string().optional().describe("图片生成模型 (gemini/jimeng)，由系统自动注入"),
    }),
  }
);

// 保存图片规划工具
const saveImagePlanTool = tool(
  async ({ creativeId, plans }) => {
    try {
      const insertData = plans.map((p: { sequence: number; role: string; description: string }) => ({
        creative_id: creativeId,
        sequence: p.sequence,
        role: p.role,
        description: p.description,
        status: "planned",
      }));
      const { data, error } = await supabase.from("image_plans").insert(insertData).select("id, sequence, role");
      if (error) throw error;
      return JSON.stringify({ success: true, planIds: data?.map((p) => p.id) || [], count: data?.length || 0 });
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  {
    name: "save_image_plan",
    description: "保存图片序列规划到数据库",
    schema: z.object({
      creativeId: z.number().describe("创意ID"),
      plans: z.array(z.object({
        sequence: z.number().describe("图片序号"),
        role: z.string().describe("图片角色"),
        description: z.string().describe("图片内容描述"),
      })).describe("图片规划列表"),
    }),
  }
);

const styleTools = [analyzeStyleTool];
const plannerTools = [saveImagePlanTool];
const referenceImageTools = [generateWithReferenceTool];

// 创建多 Agent 系统
export async function createMultiAgentSystem() {
  const config = await getLLMConfig();

  const model = new ChatOpenAI({
    configuration: { baseURL: config.baseUrl },
    apiKey: config.apiKey,
    modelName: config.model,
    temperature: 0.7,
    timeout: 60000,  // 60秒超时
    maxRetries: 3,   // 最多重试3次
    maxTokens: config.maxTokens, // 从数据库读取
  });

  // Supervisor 节点 - 决定下一步
  const supervisorNode = async (state: typeof AgentState.State) => {
    console.log("[DEBUG] supervisorNode called with state:", {
      messagesCount: state.messages.length,
      referenceImageUrl: !!state.referenceImageUrl,
      styleAnalysis: !!state.styleAnalysis,
      researchComplete: state.researchComplete,
      contentComplete: state.contentComplete,
    });

    const systemPrompt = `你是小红书内容创作团队的主管。根据当前状态决定下一步：

可用的专家：
- research_agent: 研究专家，负责搜索笔记、分析标签、研究爆款标题
- writer_agent: 创作专家，负责基于研究结果创作标题和正文
- style_analyzer_agent: 风格分析专家，负责分析参考图的视觉风格
- image_planner_agent: 图片规划专家，负责规划图片序列（封面、步骤图、细节图等）
- image_agent: 图片生成专家，负责按规划生成配图
- review_agent: 审核专家，负责审核生成结果并提供优化建议

工作流程：
1. 如果有参考图且未分析风格 → style_analyzer_agent
2. 如果还没有研究数据 → research_agent
3. 研究完成后 → writer_agent 创作内容
4. 内容创作完成后 → image_planner_agent 规划图片
5. 图片规划完成后 → image_agent 生成图片
6. 图片生成完成后 → review_agent 审核
7. 如果审核有建议 → 根据建议重新调用相应专家
8. 审核通过 → END

当前状态：
- 参考图: ${state.referenceImageUrl ? "有" : "无"}
- 风格分析: ${state.styleAnalysis ? "已完成" : "未完成"}
- 研究完成: ${state.researchComplete}
- 内容完成: ${state.contentComplete}
- 图片规划: ${state.imagePlans.length > 0 ? `已规划${state.imagePlans.length}张` : "未规划"}
- 图片生成: ${state.imagesComplete ? "已完成" : "未完成"}
- 审核反馈: ${state.reviewFeedback ? (state.reviewFeedback.approved ? "已通过" : `需优化: ${state.reviewFeedback.targetAgent}`) : "未审核"}
- 迭代次数: ${state.iterationCount}/${state.maxIterations}

注意：
- 如果迭代次数达到上限，即使审核未通过也应该结束
- 重新调用 agent 后，需要再次审核

请回复你的决定，格式：
NEXT: [agent_name] 或 NEXT: END
REASON: [简短说明原因]`;

    const response = await model.invoke([
      new HumanMessage(systemPrompt),
      ...safeSliceMessages(state.messages, 5),
    ]);

    console.log("[DEBUG] supervisorNode response:", typeof response.content === "string" ? response.content : "non-string content");

    return { messages: [response] };
  };

  // Research Agent 节点
  const researchAgentNode = async (state: typeof AgentState.State) => {
    console.log("[DEBUG] researchAgentNode called");
    const modelWithTools = model.bindTools(researchTools);

    const systemPrompt = `你是小红书内容研究专家。你的职责是：
1. 搜索相关笔记获取灵感
2. 分析热门标签了解趋势
3. 研究爆款标题的写作技巧

请使用工具进行研究，完成后总结发现的关键信息。`;

    const response = await modelWithTools.invoke([
      new HumanMessage(systemPrompt),
      ...safeSliceMessages(state.messages, 10),
    ]);

    console.log("[DEBUG] researchAgentNode response:", typeof response.content === "string" ? response.content.slice(0, 200) : "non-string content");

    return {
      messages: [response],
      currentAgent: "research_agent" as AgentType,
      researchComplete: true,  // 标记研究完成
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
      ...safeSliceMessages(state.messages, 15),
    ]);

    return {
      messages: [response],
      currentAgent: "writer_agent" as AgentType,
      contentComplete: true,
    };
  };

  // Image Agent 节点
  const imageAgentNode = async (state: typeof AgentState.State) => {
    const modelWithTools = state.referenceImageUrl
      ? model.bindTools(referenceImageTools)
      : model.bindTools(imageTools);

    const plans = state.imagePlans;
    // 如果有优化后的提示词，使用它们
    const optimizedPrompts = state.reviewFeedback?.optimizedPrompts || [];

    // 重要：明确告诉 agent 使用的参考图 URL
    const refImageUrl = state.referenceImageUrl || "";

    // 构建带 prompt 的规划列表
    const plansWithPrompts = plans.map((p, i) => {
      const prompt = optimizedPrompts[i] || p.prompt || p.description;
      return `- 序号${p.sequence} (${p.role}): prompt="${prompt}"`;
    }).join("\n");

    const systemPrompt = state.referenceImageUrl
      ? `你是小红书配图生成专家。严格按照规划的 prompt 生成配图。

【图片规划】（直接使用每张图的 prompt，不要修改）
${plansWithPrompts}

【生成规则】
1. 按 sequence 顺序逐张调用 generate_with_reference 工具
2. prompt 参数：直接使用上面规划中的 prompt 值，不要自己编写
3. referenceImageUrl 参数：使用 "${refImageUrl.slice(0, 80)}..."
4. sequence 和 role 参数：使用规划中的值

请立即为每张图调用 generate_with_reference 工具。`
      : `你是小红书封面图设计专家。根据之前创作的内容生成合适的封面图：

要求：
- 提示词要具体描述画面内容
- 选择合适的风格（realistic/illustration/minimalist）
- 确保图片适合小红书封面展示`;

    const response = await modelWithTools.invoke([
      new HumanMessage(systemPrompt),
      ...safeSliceMessages(state.messages, 10),
    ]);

    return {
      messages: [response],
      currentAgent: "image_agent" as AgentType,
      // 重新生成后重置审核状态
      reviewFeedback: null,
    };
  };

  // Style Analyzer Agent 节点 - 直接调用 Gemini 原生 API
  const styleAnalyzerNode = async (state: typeof AgentState.State) => {
    console.log("[DEBUG] styleAnalyzerNode called, referenceImageUrl:", state.referenceImageUrl?.slice(0, 50));

    try {
      if (!state.referenceImageUrl) {
        throw new Error("没有参考图 URL");
      }

      // 直接调用 Gemini 原生 API 分析风格
      console.log("[DEBUG] Calling analyzeReferenceImage directly...");
      const styleAnalysis = await analyzeReferenceImage(state.referenceImageUrl);
      console.log("[DEBUG] Style analysis result:", styleAnalysis);

      // 创建一个 AI 消息来记录分析结果
      const summaryMessage = new AIMessage(
        `风格分析完成！\n\n` +
        `📊 风格类型: ${styleAnalysis.style}\n` +
        `🎨 主色调: ${styleAnalysis.colorPalette.join(", ")}\n` +
        `✨ 氛围: ${styleAnalysis.mood}\n` +
        `📐 构图: ${styleAnalysis.composition}\n` +
        `💡 光线: ${styleAnalysis.lighting}\n` +
        `🖼️ 质感: ${styleAnalysis.texture}\n` +
        `📝 风格描述: ${styleAnalysis.description}`
      );

      return {
        messages: [summaryMessage],
        currentAgent: "style_analyzer_agent" as AgentType,
        styleAnalysis,  // 保存风格分析结果到 state
      };
    } catch (error) {
      console.error("[DEBUG] styleAnalyzerNode error:", error);
      throw error;
    }
  };

  // Image Planner Agent 节点
  const imagePlannerNode = async (state: typeof AgentState.State) => {
    const styleAnalysis = state.styleAnalysis;
    const styleDesc = styleAnalysis?.description || "高质量小红书风格";
    const colorPalette = styleAnalysis?.colorPalette?.join("、") || "柔和自然色调";
    const mood = styleAnalysis?.mood || "精致高级";
    const lighting = styleAnalysis?.lighting || "柔和自然光";
    // 如果是重新规划（有审核反馈），参考建议
    const reviewSuggestions = state.reviewFeedback?.suggestions?.join("\n") || "";

    const systemPrompt = `你是小红书图文配图规划专家。根据文案内容规划图片序列。

⚠️【核心原则：风格与内容分离】⚠️
- 风格元素（色调、氛围、光线、构图风格）→ 参考下方风格分析
- 画面内容（具体物品、场景、主题）→ 必须根据文案内容设计，绝对不要复制参考图的内容！

【风格参考（只借鉴风格，不借鉴内容）】
- 整体风格: ${styleDesc}
- 主色调: ${colorPalette}
- 氛围感: ${mood}
- 光线: ${lighting}
${reviewSuggestions ? `\n上次审核建议:\n${reviewSuggestions}\n` : ""}

【规划原则】
1. 封面图 (sequence=0): 展示文案的核心主题或最终效果
2. 内容图: 根据文案正文结构规划，展示文案中提到的具体内容
3. 图片数量: 最多4张（1张封面 + 最多3张内容图）

【图片角色】
- cover: 封面图，展示文案核心主题
- step: 步骤图，展示文案中的操作过程
- detail: 细节图，展示文案中的关键细节
- result: 成果图，展示文案描述的最终效果

【prompt 构成规则】
1. 画面内容（根据文案设计，不要抄参考图）：描述文案相关的具体场景/物品
2. 风格后缀（根据角色不同）：
   - cover: ${colorPalette}色调，${mood}氛围，${lighting}，竖版构图，3:4比例，小红书封面风格，高清精致
   - step/detail/result: ${colorPalette}色调，${mood}氛围，${lighting}，竖版构图，3:4比例，小红书配图风格，高清精致

请输出 JSON 数组，每个对象包含 sequence、role、description、prompt：
[
  {
    "sequence": 0,
    "role": "cover",
    "description": "封面：简短描述",
    "prompt": "【文案相关的画面内容】，${colorPalette}色调，${mood}氛围，${lighting}，竖版构图，3:4比例，小红书封面风格，高清精致"
  },
  {
    "sequence": 1,
    "role": "step",
    "description": "步骤图：简短描述",
    "prompt": "【文案相关的画面内容】，${colorPalette}色调，${mood}氛围，${lighting}，竖版构图，3:4比例，小红书配图风格，高清精致"
  }
]

只输出 JSON 数组，不要其他内容。`;

    const response = await model.invoke([
      new HumanMessage(systemPrompt),
      ...safeSliceMessages(state.messages, 15),
    ]);

    // 解析规划结果
    const content = typeof response.content === "string" ? response.content : "";
    let plans: ImagePlan[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        plans = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // 解析失败，使用默认规划
      plans = [
        { sequence: 0, role: "cover", description: "封面图", prompt: `精美封面，${styleDesc}风格，${colorPalette}色调，${mood}氛围，竖版构图，3:4比例，小红书封面风格` },
        { sequence: 1, role: "detail", description: "内容详情图", prompt: `内容展示，${styleDesc}风格，${colorPalette}色调，${mood}氛围，竖版构图，3:4比例，小红书风格` },
      ];
    }

    // 硬性限制最多 4 张图片
    if (plans.length > 4) {
      console.log(`[imagePlannerNode] Truncating plans from ${plans.length} to 4`);
      plans = plans.slice(0, 4);
    }

    // 确保每个 plan 都有 prompt 字段，根据角色使用不同风格
    plans = plans.map(p => {
      const styleType = p.role === 'cover' ? '小红书封面风格' : '小红书配图风格';
      return {
        ...p,
        prompt: p.prompt || `${p.description}，${styleDesc}风格，${colorPalette}色调，${mood}氛围，竖版构图，3:4比例，${styleType}，高清精致`
      };
    });

    console.log(`[imagePlannerNode] Plans with prompts:`, plans.map(p => ({ seq: p.sequence, prompt: p.prompt?.slice(0, 50) })));

    return {
      messages: [response],
      currentAgent: "image_planner_agent" as AgentType,
      imagePlans: plans,
      // 重新规划后重置审核状态，需要再次审核
      reviewFeedback: null,
      imagesComplete: false,
    };
  };

  // Review Agent 节点 - 使用支持 vision 的模型进行多模态审核
  const reviewAgentNode = async (state: typeof AgentState.State) => {
    // 获取支持 vision 的 LLM 配置
    const visionConfig = await getLLMConfig(true);
    const visionModel = new ChatOpenAI({
      configuration: { baseURL: visionConfig.baseUrl },
      apiKey: visionConfig.apiKey,
      modelName: visionConfig.model,
      temperature: 0.3,
      timeout: 120000,
      maxRetries: 2,
      maxTokens: visionConfig.maxTokens,
    });

    // 读取生成的图片用于多模态审核
    const imageContents: Array<{ type: "image_url"; image_url: { url: string } }> = [];
    for (const imagePath of state.generatedImagePaths.slice(-4)) {  // 最多审核最近4张
      try {
        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          const base64 = imageBuffer.toString("base64");
          const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
          imageContents.push({
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          });
          console.log(`[reviewAgentNode] Loaded image: ${imagePath} (${Math.round(imageBuffer.length / 1024)}KB)`);
        }
      } catch (e) {
        console.error(`[reviewAgentNode] Failed to load image: ${imagePath}`, e);
      }
    }

    const hasImages = imageContents.length > 0;
    console.log(`[reviewAgentNode] Using vision model: ${visionConfig.model}, images: ${imageContents.length}`);

    const systemPrompt = `你是小红书内容审核专家。审核生成的内容和图片，提供优化建议。

当前状态：
- 图片规划: ${JSON.stringify(state.imagePlans)}
- 风格分析: ${JSON.stringify(state.styleAnalysis)}
- 已生成图片: ${state.generatedImagePaths.length} 张
${hasImages ? "\n【请仔细查看附带的生成图片】" : ""}

审核维度：
1. 【最重要】图片内容是否与文案主题相关（不能照抄参考图内容）
${hasImages ? "2. 【视觉检查】生成的图片质量、构图、色调是否符合小红书风格" : ""}
3. 图片规划是否合理（数量、角色分配、内容覆盖）
4. prompt 是否包含：文案相关内容 + 风格后缀（色调、氛围、光线、3:4比例）

⚠️ 重点检查：图片画面内容必须与文案主题相关，不能是参考图的内容！

请输出审核结果 JSON：
{
  "approved": true/false,
  "suggestions": ["建议1", "建议2"],
  "targetAgent": "image_planner_agent" | "image_agent" | "writer_agent" | null,
  "optimizedPrompts": ["优化后的提示词1", "优化后的提示词2"] // 如果需要优化图片生成
}

如果 approved 为 true，targetAgent 应为 null。
如果需要优化，指定 targetAgent 和具体建议。`;

    // 构建多模态消息
    const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: systemPrompt },
      ...imageContents,
    ];

    const response = await visionModel.invoke([
      new HumanMessage({ content: messageContent }),
      ...safeSliceMessages(state.messages, 8),  // 减少文本消息数量，给图片留空间
    ]);

    // 解析审核结果
    const content = typeof response.content === "string" ? response.content : "";
    let feedback: ReviewFeedback = { approved: true, suggestions: [] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        feedback = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // 解析失败，默认通过
    }

    return {
      messages: [response],
      currentAgent: "review_agent" as AgentType,
      reviewFeedback: feedback,
      imagesComplete: feedback.approved,
      iterationCount: state.iterationCount + 1,  // 每次审核后增加迭代计数
    };
  };

  // Tool 节点
  const researchToolNode = new ToolNode(researchTools);
  const imageToolNode = new ToolNode(imageTools);
  const styleToolNode = new ToolNode(styleTools);
  const baseReferenceImageToolNode = new ToolNode(referenceImageTools);

  // 自定义参考图工具节点，自动注入完整的参考图 URL 和 provider
  const referenceImageToolNode = async (state: typeof AgentState.State) => {
    // 获取 state 中的完整参考图（优先使用数组，兼容单个 URL）
    const referenceImages = state.referenceImages.length > 0
      ? state.referenceImages
      : (state.referenceImageUrl ? [state.referenceImageUrl] : []);

    const fullReferenceImageUrl = referenceImages[0] || "";
    const imageProvider = state.imageGenProvider || "gemini";

    console.log(`[referenceImageToolNode] Using ${referenceImages.length} reference images, provider: ${imageProvider}`);

    // 修改消息中的工具调用参数，注入完整的 referenceImageUrl 和 provider
    const modifiedState = {
      ...state,
      messages: state.messages.map((msg) => {
        if (msg && "tool_calls" in msg && (msg as AIMessage).tool_calls?.length) {
          const aiMsg = msg as AIMessage;
          const modifiedToolCalls = aiMsg.tool_calls?.map((tc) => {
            if (tc.name === "generate_with_reference" && tc.args) {
              console.log(`[referenceImageToolNode] Injecting referenceImageUrl (${fullReferenceImageUrl.length} chars) and provider: ${imageProvider}`);
              return {
                ...tc,
                args: {
                  ...tc.args,
                  referenceImageUrl: fullReferenceImageUrl,
                  provider: imageProvider,
                },
              };
            }
            return tc;
          });
          return new AIMessage({
            content: aiMsg.content,
            tool_calls: modifiedToolCalls,
          });
        }
        return msg;
      }),
    };

    const result = await baseReferenceImageToolNode.invoke(modifiedState);

    // 统计成功生成的图片数量和路径
    let newSuccessCount = 0;
    const newImagePaths: string[] = [];
    if (result.messages) {
      for (const msg of result.messages) {
        const content = typeof msg.content === "string" ? msg.content : "";
        if (content.includes('"success":true')) {
          newSuccessCount++;
          // 提取图片路径
          const pathMatch = content.match(/"path":"([^"]+)"/);
          if (pathMatch) {
            newImagePaths.push(pathMatch[1]);
          }
        }
      }
    }

    const totalGenerated = state.generatedImageCount + newSuccessCount;
    const plannedCount = state.imagePlans.length;
    const isComplete = totalGenerated >= plannedCount && plannedCount > 0;

    console.log(`[DEBUG] referenceImageToolNode: generated ${newSuccessCount} new images, total: ${totalGenerated}/${plannedCount}, complete: ${isComplete}`);
    console.log(`[DEBUG] referenceImageToolNode: new image paths:`, newImagePaths);

    return {
      ...result,
      generatedImageCount: totalGenerated,
      generatedImagePaths: newImagePaths,  // 累加到 state
      imagesComplete: isComplete,
    };
  };

  // 路由函数
  const routeFromSupervisor = (state: typeof AgentState.State): string => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";

    console.log("[DEBUG] routeFromSupervisor - lastMessage content:", content.slice(0, 500));
    console.log("[DEBUG] routeFromSupervisor - state:", {
      referenceImageUrl: !!state.referenceImageUrl,
      styleAnalysis: !!state.styleAnalysis,
      researchComplete: state.researchComplete,
      contentComplete: state.contentComplete,
      imagePlans: state.imagePlans.length,
      generatedImageCount: state.generatedImageCount,
      imagesComplete: state.imagesComplete,
      reviewFeedback: state.reviewFeedback,
    });

    if (content.includes("NEXT: research_agent")) {
      console.log("[DEBUG] Routing to: research_agent");
      return "research_agent";
    }
    if (content.includes("NEXT: writer_agent")) {
      console.log("[DEBUG] Routing to: writer_agent");
      return "writer_agent";
    }
    if (content.includes("NEXT: style_analyzer_agent")) {
      console.log("[DEBUG] Routing to: style_analyzer_agent");
      return "style_analyzer_agent";
    }
    if (content.includes("NEXT: image_planner_agent")) {
      console.log("[DEBUG] Routing to: image_planner_agent");
      return "image_planner_agent";
    }
    if (content.includes("NEXT: image_agent")) {
      console.log("[DEBUG] Routing to: image_agent");
      return "image_agent";
    }
    if (content.includes("NEXT: review_agent")) {
      console.log("[DEBUG] Routing to: review_agent");
      return "review_agent";
    }
    if (content.includes("NEXT: END")) {
      console.log("[DEBUG] Routing to: END");
      return END;
    }

    // 默认流程
    console.log("[DEBUG] Using default routing logic");
    if (state.referenceImageUrl && !state.styleAnalysis) {
      console.log("[DEBUG] Default routing to: style_analyzer_agent");
      return "style_analyzer_agent";
    }
    if (!state.researchComplete) {
      console.log("[DEBUG] Default routing to: research_agent");
      return "research_agent";
    }
    if (!state.contentComplete) {
      console.log("[DEBUG] Default routing to: writer_agent");
      return "writer_agent";
    }
    if (state.imagePlans.length === 0) {
      console.log("[DEBUG] Default routing to: image_planner_agent");
      return "image_planner_agent";
    }
    if (!state.imagesComplete) {
      console.log("[DEBUG] Default routing to: image_agent");
      return "image_agent";
    }
    if (!state.reviewFeedback) {
      console.log("[DEBUG] Default routing to: review_agent");
      return "review_agent";
    }

    // 审核未通过但未达到迭代上限，重新调用目标 agent
    if (state.reviewFeedback && !state.reviewFeedback.approved) {
      if (state.iterationCount < state.maxIterations && state.reviewFeedback.targetAgent) {
        console.log("[DEBUG] Routing to targetAgent:", state.reviewFeedback.targetAgent);
        return state.reviewFeedback.targetAgent;
      }
      // 达到迭代上限，强制结束
      console.log("[DEBUG] Iteration limit reached, routing to END");
      return END;
    }
    console.log("[DEBUG] Final fallback routing to END");
    return END;
  };

  const shouldContinueResearch = (state: typeof AgentState.State): string => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
      return "research_tools";
    }
    return "supervisor";
  };

  // 跟踪 image_agent 的工具调用次数
  let imageToolCallCount = 0;
  const MAX_IMAGE_TOOL_CALLS = 10; // 最多调用10次工具

  const shouldContinueImage = (state: typeof AgentState.State): string => {
    const lastMessage = state.messages[state.messages.length - 1];

    // 检查是否有工具调用
    if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
      imageToolCallCount++;
      console.log(`[DEBUG] Image tool call count: ${imageToolCallCount}/${MAX_IMAGE_TOOL_CALLS}`);
      if (imageToolCallCount >= MAX_IMAGE_TOOL_CALLS) {
        console.log("[DEBUG] Max image tool calls reached, stopping");
        return "supervisor";
      }
      return state.referenceImageUrl ? "reference_image_tools" : "image_tools";
    }

    // 检查是否已完成所有图片生成
    const plannedCount = state.imagePlans.length;
    const generatedCount = state.generatedImageCount;
    console.log(`[DEBUG] shouldContinueImage: generated ${generatedCount}/${plannedCount}, imagesComplete: ${state.imagesComplete}`);

    return "supervisor";
  };

  const shouldContinueStyle = (state: typeof AgentState.State): string => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && "tool_calls" in lastMessage && (lastMessage as AIMessage).tool_calls?.length) {
      return "style_tools";
    }
    // 解析风格分析结果
    const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";
    let styleAnalysis: StyleAnalysis | null = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*"style"[\s\S]*\}/);
      if (jsonMatch) {
        styleAnalysis = JSON.parse(jsonMatch[0]);
      }
    } catch {}
    if (styleAnalysis) {
      return "supervisor_with_style";
    }
    return "supervisor";
  };

  // 构建 Graph
  const workflow = new StateGraph(AgentState)
    .addNode("supervisor", supervisorNode)
    .addNode("research_agent", researchAgentNode)
    .addNode("writer_agent", writerAgentNode)
    .addNode("style_analyzer_agent", styleAnalyzerNode)
    .addNode("image_planner_agent", imagePlannerNode)
    .addNode("image_agent", imageAgentNode)
    .addNode("review_agent", reviewAgentNode)
    .addNode("research_tools", researchToolNode)
    .addNode("image_tools", imageToolNode)
    .addNode("style_tools", styleToolNode)
    .addNode("reference_image_tools", referenceImageToolNode)
    // 风格分析后更新状态的中间节点
    .addNode("supervisor_with_style", async (state: typeof AgentState.State) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";
      let styleAnalysis: StyleAnalysis | null = null;
      try {
        const jsonMatch = content.match(/\{[\s\S]*"style"[\s\S]*\}/);
        if (jsonMatch) {
          styleAnalysis = JSON.parse(jsonMatch[0]);
        }
      } catch {}
      return { styleAnalysis };
    })
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", routeFromSupervisor, {
      research_agent: "research_agent",
      writer_agent: "writer_agent",
      style_analyzer_agent: "style_analyzer_agent",
      image_planner_agent: "image_planner_agent",
      image_agent: "image_agent",
      review_agent: "review_agent",
      [END]: END,
    })
    .addConditionalEdges("research_agent", shouldContinueResearch, {
      research_tools: "research_tools",
      supervisor: "supervisor",
    })
    .addEdge("research_tools", "research_agent")
    .addEdge("writer_agent", "supervisor")
    .addConditionalEdges("style_analyzer_agent", shouldContinueStyle, {
      style_tools: "style_tools",
      supervisor: "supervisor",
      supervisor_with_style: "supervisor_with_style",
    })
    .addEdge("style_tools", "style_analyzer_agent")
    .addEdge("supervisor_with_style", "supervisor")
    .addEdge("image_planner_agent", "supervisor")
    .addConditionalEdges("image_agent", shouldContinueImage, {
      image_tools: "image_tools",
      reference_image_tools: "reference_image_tools",
      supervisor: "supervisor",
    })
    .addEdge("image_tools", "image_agent")
    .addEdge("reference_image_tools", "image_agent")
    .addEdge("review_agent", "supervisor");

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
