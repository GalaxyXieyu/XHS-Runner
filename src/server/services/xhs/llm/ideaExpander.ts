import { generateText } from '../../llm/streamService';

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的小红书配图创意专家。根据用户提供的主题idea，生成多个不同角度的图片描述prompt。

要求：
1. 每个prompt描述一个独立的视觉场景
2. prompt之间要有差异化（不同角度、不同元素、不同氛围）
3. 适合小红书风格：精致、有质感、吸引眼球
4. 输出纯JSON数组，不要其他内容`;

const ASPECT_RATIO_HINTS: Record<string, string> = {
  '3:4': '竖版构图，适合人像和产品展示',
  '1:1': '方形构图，适合对称和居中主体',
  '4:3': '横版构图，适合风景和场景展示',
};

export interface ExpandOptions {
  systemPrompt?: string;
  aspectRatio?: string;
  goal?: 'collects' | 'comments' | 'followers';
  persona?: string;
  tone?: string;
  extraRequirements?: string;
}

/**
 * 将一个 idea 扩展成多个不同角度的 image prompts
 */
export async function expandIdea(idea: string, count: number, options?: ExpandOptions): Promise<string[]> {
  if (!idea?.trim()) {
    throw new Error('IDEA_REQUIRED: idea is required');
  }

  const safeCount = Math.max(1, Math.min(9, count));
  const systemPrompt = options?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const aspectHint = options?.aspectRatio ? ASPECT_RATIO_HINTS[options.aspectRatio] || '' : '';
  const goalHint =
    options?.goal === 'collects'
      ? '收藏优先（更强调信息密度、可复制清单、对比与总结）'
      : options?.goal === 'comments'
        ? '评论优先（更强调争议点/提问互动/观点对立）'
        : options?.goal === 'followers'
          ? '涨粉优先（更强调人设、系列化、强记忆点）'
          : '';
  const persona = String(options?.persona ?? '').trim();
  const tone = String(options?.tone ?? '').trim();
  const extraRequirements = String(options?.extraRequirements ?? '').trim();

  const prompt = `${systemPrompt}

主题：${idea.trim()}
数量：${safeCount}${aspectHint ? `\n构图要求：${aspectHint}` : ''}${goalHint ? `\n内容目标：${goalHint}` : ''}${persona ? `\n目标受众：${persona}` : ''}${tone ? `\n语气偏好：${tone}` : ''}${extraRequirements ? `\n额外要求：${extraRequirements}` : ''}

请生成${safeCount}个不同角度的图片描述prompt，直接输出JSON数组：
["prompt1", "prompt2", ...]`;

  const result = await generateText(prompt);

  const jsonMatch = result.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('LLM_PARSE_ERROR: 无法解析 LLM 返回的 JSON 数组');
  }

  try {
    const prompts = JSON.parse(jsonMatch[0]) as string[];
    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('LLM_PARSE_ERROR: 返回的不是有效的字符串数组');
    }
    return prompts.slice(0, safeCount);
  } catch {
    throw new Error('LLM_PARSE_ERROR: JSON 解析失败');
  }
}
