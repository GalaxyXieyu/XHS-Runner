import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type ImagePlan } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { askUserTool } from "../tools";
import { getTemplateByKey, type TemplateStructure } from "../../services/contentTypeTemplateManager";

/**
 * 从消息中提取标题
 * 支持两种格式：
 * 1. JSON 格式: {"title": "标题文本", ...} (writer_agent 的实际输出)
 * 2. 文本格式: 标题：xxx 或 标题:xxx
 */
function extractTitleFromMessages(messages: { content: unknown }[]): string {
  console.log(`[extractTitleFromMessages] 开始提取标题，共 ${messages.length} 条消息`);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg.content === "string") {
      const contentPreview = msg.content.slice(0, 200);
      console.log(`[extractTitleFromMessages] 检查消息 ${i}: "${contentPreview}${msg.content.length > 200 ? '...' : ''}"`);

      // 1. 尝试从 JSON 格式提取 (writer_agent 的实际输出)
      const jsonMatch = msg.content.match(/"title"\s*:\s*"([^"]+)"/);
      if (jsonMatch) {
        const title = jsonMatch[1].trim();
        console.log(`[extractTitleFromMessages] ✅ 从 JSON 格式提取成功: "${title}"`);
        return title;
      }

      // 2. 尝试原有的 "标题：xxx" 格式
      const titleMatch = msg.content.match(/标题[：:]\s*(.+?)(?:\n|$)/);
      if (titleMatch) {
        const title = titleMatch[1].trim();
        console.log(`[extractTitleFromMessages] ✅ 从文本格式提取成功: "${title}"`);
        return title;
      }
    }
  }

  // 提取失败，输出详细警告
  console.warn(`[extractTitleFromMessages] ⚠️ 标题提取失败！所有消息内容如下：`);
  messages.forEach((msg, i) => {
    if (typeof msg.content === "string") {
      console.warn(`  消息 ${i}: ${msg.content.slice(0, 500)}${msg.content.length > 500 ? '...' : ''}`);
    } else {
      console.warn(`  消息 ${i}: [非字符串类型] ${typeof msg.content}`);
    }
  });
  console.warn(`[extractTitleFromMessages] 返回默认值 "AI 生成内容"，请检查 writer_agent 的输出格式`);

  return "AI 生成内容";
}

/**
 * 从参考图 URL 列表提取风格参数
 */
async function extractStyleFromUrls(referenceImageUrls: string[]): Promise<{
  colorPalette: string[];
  mood: string;
  lighting: string;
  layout: string;
  textDensity: string;
  elementaryComponents: string[];
  styleKeywords: string[];
}> {
  const { analyzeReferenceImage } = await import("../../services/xhs/llm/geminiClient");

  const allStyleParams: {
    colorPalette: string[];
    mood: string;
    lighting: string;
    layout?: string;
    textDensity?: string;
    elementaryComponents?: string[];
    styleKeywords: string[];
  }[] = [];

  for (const url of referenceImageUrls) {
    try {
      const styleAnalysis = await analyzeReferenceImage(url);

      // 判断是否是风格参考（基于描述）
      const description = styleAnalysis.description.toLowerCase();
      const hasSpecificContent = /\b(产品|人物|场景|物品|手机|电脑|服装|食物|建筑|房间|办公室)\b/.test(description);
      const isStyleReference = !hasSpecificContent;

      if (isStyleReference) {
        allStyleParams.push({
          colorPalette: styleAnalysis.colorPalette,
          mood: styleAnalysis.mood,
          lighting: styleAnalysis.lighting,
          layout: styleAnalysis.layout,
          textDensity: styleAnalysis.textDensity,
          elementaryComponents: styleAnalysis.elementaryComponents,
          styleKeywords: [styleAnalysis.style],
        });
      }
    } catch (error) {
      console.error(`分析参考图失败: ${url}`, error);
    }
  }

  if (allStyleParams.length === 0) {
    return {
      colorPalette: [],
      mood: "",
      lighting: "",
      layout: "",
      textDensity: "",
      elementaryComponents: [],
      styleKeywords: [],
    };
  }

  // 合并风格参数
  const colorPaletteSet = new Set<string>();
  const moodSet = new Set<string>();
  const lightingSet = new Set<string>();
  const layoutSet = new Set<string>();
  const textDensitySet = new Set<string>();
  const elementaryComponentsSet = new Set<string>();
  const styleKeywordsSet = new Set<string>();

  for (const params of allStyleParams) {
    params.colorPalette.forEach((c) => colorPaletteSet.add(c));
    if (params.mood) moodSet.add(params.mood);
    if (params.lighting) lightingSet.add(params.lighting);
    if (params.layout) layoutSet.add(params.layout);
    if (params.textDensity) textDensitySet.add(params.textDensity);
    params.elementaryComponents?.forEach((c) => elementaryComponentsSet.add(c));
    params.styleKeywords.forEach((k) => styleKeywordsSet.add(k));
  }

  return {
    colorPalette: Array.from(colorPaletteSet),
    mood: Array.from(moodSet).join(" + "),
    lighting: Array.from(lightingSet).join(" + "),
    layout: Array.from(layoutSet).join(" + "),
    textDensity: Array.from(textDensitySet).join(" + "),
    elementaryComponents: Array.from(elementaryComponentsSet),
    styleKeywords: Array.from(styleKeywordsSet),
  };
}

/**
 * 生成基于模板的图片规划
 * 使用 Agent 模式：Agent 根据模板自动生成 prompts
 */
export async function imagePlannerNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const modelWithTools = model.bindTools([askUserTool]);

  const compressed = await compressContext(state, model);

  // 获取内容类型模板
  const contentType = state.contentType || "product"; // 默认种草类型
  const template = await getTemplateByKey(contentType);

  // 从参考图提取风格参数
  let styleParams = {
    colorPalette: [] as string[],
    mood: "",
    lighting: "",
    layout: "",
    textDensity: "",
    elementaryComponents: [] as string[],
    styleKeywords: [] as string[],
  };

  if (state.referenceImages && state.referenceImages.length > 0) {
    styleParams = await extractStyleFromUrls(state.referenceImages);
  }

  // 如果没有参考图风格，使用传统的 styleAnalysis
  const styleAnalysis = state.styleAnalysis;
  if (!styleParams.colorPalette.length && styleAnalysis?.colorPalette) {
    styleParams.colorPalette = styleAnalysis.colorPalette;
  }
  if (!styleParams.mood && styleAnalysis?.mood) {
    styleParams.mood = styleAnalysis.mood;
  }
  if (!styleParams.lighting && styleAnalysis?.lighting) {
    styleParams.lighting = styleAnalysis.lighting;
  }
  if (!styleParams.layout && styleAnalysis?.layout) {
    styleParams.layout = styleAnalysis.layout;
  }
  if (!styleParams.textDensity && styleAnalysis?.textDensity) {
    styleParams.textDensity = styleAnalysis.textDensity;
  }
  if (!styleParams.elementaryComponents.length && styleAnalysis?.elementaryComponents) {
    styleParams.elementaryComponents = styleAnalysis.elementaryComponents;
  }


  const colorPalette = styleParams.colorPalette.join("、") || "柔和自然色调";
  const mood = styleParams.mood || "精致高级";
  const lighting = styleParams.lighting || "柔和自然光";
  const layout = styleParams.layout || "多图拼接";
  const textDensity = styleParams.textDensity || "适中";
  const elementaryComponents = styleParams.elementaryComponents.join("、") || "无";
  const reviewSuggestions = state.reviewFeedback?.suggestions?.join("\n") || "";

  // 从消息中提取标题
  const title = extractTitleFromMessages(state.messages);

  // 使用模板生成规划
  let plans: ImagePlan[] = [];

  if (template) {
    // 从 Langfuse 获取 prompt
    const structure = template.structure as TemplateStructure;
    const structureDesc = [
      structure.cover ? `封面 (cover): ${structure.cover.description}，需要 ${structure.cover.imageCount} 张` : "",
      structure.steps ? `步骤 (steps): ${structure.steps.description}，需要 ${structure.steps.imageCount} 张` : "",
      structure.detail ? `细节 (detail): ${structure.detail.description}，需要 ${structure.detail.imageCount || 1} 张` : "",
      structure.result ? `总结 (result): ${structure.result.description}，需要 ${structure.result.imageCount || 1} 张` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = await getAgentPrompt("image_planner_agent", {
      templateName: template.name,
      templateDescription: template.description,
      colorPalette,
      mood,
      lighting,
      layout,
      textDensity,
      elementaryComponents,
      structureDesc,
      coverPromptTemplate: template.coverPromptTemplate,
      contentPromptTemplate: template.contentPromptTemplate,
      reviewSuggestions,
    });

    if (!systemPrompt) {
      throw new Error("Prompt 'image_planner_agent' not found. Please create it in Langfuse: xhs-agent-image_planner_agent");
    }

    // 调用 LLM 生成图片规划
    const response = await modelWithTools.invoke([
      new HumanMessage(systemPrompt),
      new HumanMessage(`请根据上述模板和风格参数，为以下内容生成图片规划：\n\n标题：${title}\n\n请输出 JSON 格式的图片规划。`),
      ...safeSliceMessages(compressed.messages, 10),
    ]);

    // 解析规划结果
    const content = typeof response.content === "string" ? response.content : "";
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        plans = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // 解析失败，使用占位计划
    }

    // 如果解析失败或没有生成完整计划，使用非 agent 模式生成完整 prompt
    if (plans.length === 0 || plans.some(p => !p.prompt)) {
      plans = generatePlansFromTemplate(template, title, {
        colorPalette,
        mood,
        lighting,
      }, false); // 改为 false，生成完整 prompt
    }

    // 如果有 review feedback，添加到 plan 中
    if (reviewSuggestions) {
      plans = plans.map(p => ({
        ...p,
        prompt: p.prompt ? `${p.prompt}\n\n## 审核反馈优化\n${reviewSuggestions}\n\n请根据反馈优化。` : "",
      }));
    }
  } else {
    // 兜底：使用传统方式
    plans = generateFallbackPlans(title, { colorPalette, mood, lighting });
  }

  // 创建包含 JSON 格式的消息（用于 HITL 提取）
  const plansJson = JSON.stringify(plans, null, 2);
  const summaryMessage = new AIMessage(
    `图片规划完成\n\n` +
    `共规划 ${plans.length} 张图片：${plans.map(p => p.role).join('、')}\n` +
    `风格：${colorPalette} / ${mood}\n\n` +
    `\`\`\`json\n${plansJson}\n\`\`\``
  );

  return {
    messages: [summaryMessage],
    currentAgent: "image_planner_agent" as AgentType,
    imagePlans: plans,
    reviewFeedback: null,
    imagesComplete: false,
    summary: compressed.summary,
  };
}

/**
 * 从模板生成图片规划
 * 如果使用 agent 模式，直接返回模板信息让 Agent 决定
 */
function generatePlansFromTemplate(
  template: { key: string; name: string; structure: unknown; coverPromptTemplate: string; contentPromptTemplate: string; defaultAspectRatio: string },
  title: string,
  style: { colorPalette: string; mood: string; lighting: string },
  useAgentMode: boolean = false
): ImagePlan[] {
  const structure = template.structure as TemplateStructure;
  const plans: ImagePlan[] = [];
  let sequence = 0;

  // 如果是 agent 模式，返回占位计划，让 Agent 根据模板生成详细描述
  if (useAgentMode) {
    // 封面
    if (structure.cover) {
      plans.push({
        sequence: sequence++,
        role: structure.cover.role,
        description: structure.cover.description,
        prompt: "", // Agent 会根据模板生成
      });
    }

    // 步骤图
    if (structure.steps) {
      for (let i = 0; i < (structure.steps.imageCount || 1); i++) {
        plans.push({
          sequence: sequence++,
          role: structure.steps.role,
          description: `${structure.steps.description} ${i + 1}`,
          prompt: "", // Agent 会根据模板生成
        });
      }
    }

    // 细节图
    if (structure.detail) {
      plans.push({
        sequence: sequence++,
        role: structure.detail.role,
        description: structure.detail.description,
        prompt: "",
      });
    }

    // 总结图
    if (structure.result) {
      plans.push({
        sequence: sequence++,
        role: structure.result.role,
        description: structure.result.description,
        prompt: "",
      });
    }

    return plans.slice(0, 4);
  }

  // 非 agent 模式：直接生成完整 prompt
  // 封面
  if (structure.cover) {
    const coverPrompt = generatePrompt(template.coverPromptTemplate, {
      title,
      role: structure.cover.role,
      description: structure.cover.description,
      colorPalette: style.colorPalette,
      mood: style.mood,
      lighting: style.lighting,
    });

    plans.push({
      sequence: sequence++,
      role: structure.cover.role,
      description: structure.cover.description,
      prompt: coverPrompt,
    });
  }

  // 步骤图
  if (structure.steps) {
    for (let i = 0; i < (structure.steps.imageCount || 1); i++) {
      const stepPrompt = generatePrompt(template.contentPromptTemplate, {
        title,
        role: structure.steps!.role,
        description: `${structure.steps!.description} ${i + 1}/${structure.steps!.imageCount}`,
        colorPalette: style.colorPalette,
        mood: style.mood,
        lighting: style.lighting,
      });

      plans.push({
        sequence: sequence++,
        role: structure.steps!.role,
        description: `${structure.steps!.description} ${i + 1}`,
        prompt: stepPrompt,
      });
    }
  }

  // 细节图
  if (structure.detail) {
    const detailPrompt = generatePrompt(template.contentPromptTemplate, {
      title,
      role: structure.detail.role,
      description: structure.detail.description,
      colorPalette: style.colorPalette,
      mood: style.mood,
      lighting: style.lighting,
    });

    plans.push({
      sequence: sequence++,
      role: structure.detail.role,
      description: structure.detail.description,
      prompt: detailPrompt,
    });
  }

  // 总结图
  if (structure.result) {
    const resultPrompt = generatePrompt(template.contentPromptTemplate, {
      title,
      role: structure.result.role,
      description: structure.result.description,
      colorPalette: style.colorPalette,
      mood: style.mood,
      lighting: style.lighting,
    });

    plans.push({
      sequence: sequence++,
      role: structure.result.role,
      description: structure.result.description,
      prompt: resultPrompt,
    });
  }

  // 限制最多 4 张图
  if (plans.length > 4) {
    return plans.slice(0, 4);
  }

  return plans;
}

/**
 * 生成 Agent 模式的系统提示词
 */
export function generateAgentSystemPrompt(
  template: { key: string; name: string; description: string; structure: unknown; coverPromptTemplate: string; contentPromptTemplate: string },
  style: { colorPalette: string; mood: string; lighting: string }
): string {
  const structure = template.structure as TemplateStructure;

  return `你是一个专业的小红书图文配图规划专家。

## 当前内容类型
- 类型: ${template.name}
- 说明: ${template.description}

## 风格参数
- 色调: ${style.colorPalette}
- 氛围: ${style.mood}
- 光线: ${style.lighting}

## 图片结构要求
${structure.cover ? `- 封面 (cover): ${structure.cover.description}，需要 ${structure.cover.imageCount} 张` : ""}
${structure.steps ? `- 步骤 (steps): ${structure.steps.description}，需要 ${structure.steps.imageCount} 张` : ""}
${structure.detail ? `- 细节 (detail): ${structure.detail.description}，需要 ${structure.detail.imageCount || 1} 张` : ""}
${structure.result ? `- 总结 (result): ${structure.result.description}，需要 ${structure.result.imageCount || 1} 张` : ""}

## 任务要求
根据用户的内容和上述风格参数，为每张图片生成详细的画面描述 prompt。

### 封面图 prompt 模板
${template.coverPromptTemplate}

### 内容图 prompt 模板
${template.contentPromptTemplate}

### 风格统一要求
- 所有图片保持 ${style.mood} 氛围
- 使用 ${style.colorPalette} 色调
- 保持竖版 3:4 比例
- 小红书风格，高清精致

## 输出格式
请以 JSON 数组格式输出，每张图片包含：
- sequence: 序号
- role: 角色（cover/steps/detail/result）
- description: 简短描述
- prompt: 详细的画面描述（包含风格参数）

示例输出：
\`\`\`json
[
  {"sequence": 0, "role": "cover", "description": "封面图", "prompt": "..."},
  {"sequence": 1, "role": "steps", "description": "步骤图1", "prompt": "..."}
]
\`\`\`

请直接输出 JSON，不要有其他内容。`;
}

/**
 * 渲染 prompt 模板
 */
function generatePrompt(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

/**
 * 生成兜底规划（无模板时使用）
 */
function generateFallbackPlans(
  title: string,
  style: { colorPalette: string; mood: string; lighting: string }
): ImagePlan[] {
  return [
    {
      sequence: 0,
      role: "cover",
      description: "封面图",
      prompt: `【封面设计】主题：${title}\n\n精美封面，${style.mood}氛围，${style.colorPalette}色调，竖版构图，3:4比例，小红书封面风格，高清精致，视觉冲击力强`,
    },
    {
      sequence: 1,
      role: "detail",
      description: "内容详情图1",
      prompt: `【内容展示】${title}\n\n内容展示，${style.mood}氛围，${style.colorPalette}色调，竖版构图，3:4比例，小红书配图风格，信息传达清晰`,
    },
    {
      sequence: 2,
      role: "detail",
      description: "内容详情图2",
      prompt: `【内容细节】${title}\n\n细节展示，${style.mood}氛围，${style.colorPalette}色调，竖版构图，3:4比例，小红书配图风格`,
    },
  ];
}

/**
 * 根据审核反馈重新生成 prompts
 */
function regeneratePromptsWithFeedback(
  plans: ImagePlan[],
  template: { coverPromptTemplate: string; contentPromptTemplate: string },
  title: string,
  style: { colorPalette: string; mood: string; lighting: string },
  feedback: string
): ImagePlan[] {
  return plans.map((plan) => {
    const templateStr = plan.role === "cover"
      ? template.coverPromptTemplate
      : template.contentPromptTemplate;

    const basePrompt = generatePrompt(templateStr, {
      title,
      role: plan.role,
      description: plan.description,
      colorPalette: style.colorPalette,
      mood: style.mood,
      lighting: style.lighting,
    });

    return {
      ...plan,
      prompt: `${basePrompt}\n\n## 审核反馈优化\n${feedback}\n\n请根据以上反馈优化图片描述。`,
    };
  });
}
