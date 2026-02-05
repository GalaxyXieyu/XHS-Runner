/**
 * AI 回复生成服务
 * 使用 LLM 生成针对评论的智能回复
 */

import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';

interface AIReplyInput {
  commentContent: string;
  commentAuthor: string;
  noteTitle: string;
  noteContent: string;
}

/**
 * 生成 AI 回复
 */
export async function generateAIReply(input: AIReplyInput): Promise<string> {
  // 获取默认 LLM 配置
  const [provider] = await db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isDefault, true))
    .limit(1);

  if (!provider || !provider.apiKey || !provider.baseUrl) {
    // 如果没有配置 LLM，返回默认模板回复
    return generateTemplateReply(input);
  }

  try {
    // 构建 prompt
    const systemPrompt = `你是一个小红书博主的助手，负责回复粉丝的评论。回复要求：
1. 亲切友好，像朋友聊天一样
2. 简短有力，不超过50字
3. 适当使用表情符号增加亲和力
4. 如果是提问，尽量给出有用的回答
5. 如果是赞美，表达真诚的感谢`;

    const userPrompt = `笔记标题：${input.noteTitle || '无'}
笔记内容摘要：${input.noteContent?.slice(0, 200) || '无'}

用户「${input.commentAuthor}」评论说：「${input.commentContent}」

请生成一条合适的回复：`;

    // 调用 LLM API
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.modelName || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return generateTemplateReply(input);
    }

    return reply;
  } catch (error: any) {
    console.error('AI reply generation failed:', error);
    return generateTemplateReply(input);
  }
}

/**
 * 模板回复（当 LLM 不可用时的降级方案）
 */
function generateTemplateReply(input: AIReplyInput): string {
  const templates = [
    `感谢${input.commentAuthor}的支持！🥰`,
    `谢谢你的评论！有问题随时问我哦～`,
    `太开心看到你的留言了！❤️`,
    `感谢关注！后续会分享更多内容的～`,
  ];

  // 简单的模板选择逻辑
  if (input.commentContent.includes('?') || input.commentContent.includes('？')) {
    return '感谢提问！这个问题很好，我会在后续内容中详细解答～';
  }

  return templates[Math.floor(Math.random() * templates.length)];
}
