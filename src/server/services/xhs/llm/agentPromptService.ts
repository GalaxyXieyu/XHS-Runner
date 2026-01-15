import { db, schema } from '../../../db';
import { eq, and } from 'drizzle-orm';

export interface AgentPromptConfig {
  imageTarget?: number;
  researchComplete?: boolean;
  contentComplete?: boolean;
  imageCount?: number;
  message?: string;
}

// 缓存已加载的提示词
const promptCache = new Map<string, string>();

/**
 * 从数据库加载 Agent 提示词
 */
export async function getAgentPrompt(
  agentName: string,
  config: AgentPromptConfig = {}
): Promise<string> {
  const cacheKey = agentName;

  // 检查缓存
  let template = promptCache.get(cacheKey);

  if (!template) {
    // 从数据库加载
    const [prompt] = await db
      .select()
      .from(schema.promptProfiles)
      .where(
        and(
          eq(schema.promptProfiles.name, agentName),
          eq(schema.promptProfiles.category, 'agent')
        )
      )
      .limit(1);

    if (prompt) {
      template = prompt.systemPrompt;
      promptCache.set(cacheKey, template);
    }
  }

  if (!template) {
    console.warn(`[AgentPrompt] Prompt not found for agent: ${agentName}, using fallback`);
    return getFallbackPrompt(agentName, config);
  }

  // 替换模板变量
  return renderTemplate(template, config);
}

/**
 * 渲染模板变量
 */
function renderTemplate(template: string, config: AgentPromptConfig): string {
  const defaults: AgentPromptConfig = {
    imageTarget: 3,
    researchComplete: false,
    contentComplete: false,
    imageCount: 0,
    message: '',
  };

  const merged = { ...defaults, ...config };

  return template
    .replace(/\{\{imageTarget\}\}/g, String(merged.imageTarget))
    .replace(/\{\{researchComplete\}\}/g, String(merged.researchComplete))
    .replace(/\{\{contentComplete\}\}/g, String(merged.contentComplete))
    .replace(/\{\{imageCount\}\}/g, String(merged.imageCount))
    .replace(/\{\{message\}\}/g, merged.message || '');
}

/**
 * 清除提示词缓存
 */
export function clearPromptCache() {
  promptCache.clear();
}

/**
 * 获取所有 Agent 提示词
 */
export async function getAllAgentPrompts() {
  return db
    .select()
    .from(schema.promptProfiles)
    .where(eq(schema.promptProfiles.category, 'agent'));
}

/**
 * 更新 Agent 提示词
 */
export async function updateAgentPrompt(
  agentName: string,
  systemPrompt: string
) {
  const result = await db
    .update(schema.promptProfiles)
    .set({ systemPrompt, updatedAt: new Date() })
    .where(
      and(
        eq(schema.promptProfiles.name, agentName),
        eq(schema.promptProfiles.category, 'agent')
      )
    )
    .returning();

  // 清除缓存
  promptCache.delete(agentName);

  return result[0];
}

/**
 * 回退提示词（数据库未配置时使用）
 */
function getFallbackPrompt(agentName: string, config: AgentPromptConfig): string {
  const fallbacks: Record<string, string> = {
    supervisor: `你是小红书内容创作团队的主管。根据当前状态决定下一步：

可用的专家：
- research_agent: 研究专家
- writer_agent: 创作专家
- image_agent: 图片专家

当前状态：
- 研究完成: ${config.researchComplete}
- 内容完成: ${config.contentComplete}
- 已生成图片: ${config.imageCount} 张（需要${config.imageTarget || 3}张）

请回复你的决定，格式：
NEXT: [agent_name] 或 NEXT: END
REASON: [简短说明原因]`,

    research_agent: `你是小红书内容研究专家。请使用工具进行研究，完成后总结发现的关键信息。`,

    writer_agent: `你是小红书爆款内容创作专家。基于之前的研究结果创作内容：

输出格式：
📌 标题：[吸引眼球的标题]
📝 正文：[分段清晰、包含emoji的内容]
🏷️ 标签：[5-10个相关标签]`,

    image_agent: `你是小红书封面图设计专家。生成 ${config.imageTarget || 3} 张不同风格的封面图。

提示词必须包含：
- "vertical composition, 3:4 aspect ratio"
- "xiaohongshu cover style, eye-catching"`,
  };

  return fallbacks[agentName] || `你是 ${agentName}，请完成你的任务。`;
}
