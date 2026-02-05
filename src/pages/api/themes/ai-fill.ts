import type { NextApiRequest, NextApiResponse } from 'next';
import { createLLM } from '../../../server/agents/utils/configUtils';
import { HumanMessage } from '@langchain/core/messages';

interface AIFillRequest {
  themeName: string;
}

interface AIFillResponse {
  description: string;
  keywords: string;
  competitors: string;
  goal: string;
  persona: string;
  tone: string;
  contentTypes: string;
  forbiddenTags: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { themeName } = req.body as AIFillRequest;

  if (!themeName?.trim()) {
    return res.status(400).json({ error: '请输入主题名称' });
  }

  try {
    const llm = await createLLM();

    const prompt = `你是小红书内容运营专家。根据用户给出的主题名称，生成完整的主题配置信息。

主题名称：${themeName}

请输出 JSON 格式，包含以下字段：
- description: 主题描述（30-50字，简要说明这个主题的内容方向）
- keywords: 关键词（5-8个，用逗号分隔，用于小红书搜索抓取）
- competitors: 推荐关注的竞品账号类型（2-3个类型，用逗号分隔）
- goal: 内容目标（从"收藏优先"/"评论优先"/"涨粉优先"中选择，可组合）
- persona: 目标受众画像（如"25-35岁职场女性"）
- tone: 语气风格（从"干货"/"亲和"/"专业"/"种草"/"测评"中选择1-2个）
- contentTypes: 适合的内容结构（如"清单"/"教程"/"对比"/"测评"/"日常分享"，选2-3个）
- forbiddenTags: 建议禁用的标签（与主题无关或风险标签，用逗号分隔）

只输出 JSON，不要其他内容。`;

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    // 提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'AI 返回格式错误' });
    }

    const result = JSON.parse(jsonMatch[0]) as AIFillResponse;
    return res.status(200).json(result);
  } catch (error) {
    console.error('AI fill error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'AI 填充失败'
    });
  }
}
