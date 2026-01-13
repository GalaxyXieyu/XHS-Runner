import type { NextApiResponse } from 'next';
import { db, schema } from '../../db';
import { and, eq } from 'drizzle-orm';
import { getSettings } from '../../settings';

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 获取 LLM 配置
 * 优先级: 指定 providerId > 默认启用的 provider > settings 配置
 */
export async function getLLMConfig(providerId?: number): Promise<LLMConfig | null> {
  const providers = schema.llmProviders;

  // 1. 如果指定了 providerId，使用指定的 provider
  if (providerId) {
    const rows = await db
      .select({
        baseUrl: providers.baseUrl,
        apiKey: providers.apiKey,
        model: providers.modelName,
      })
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);

    const row = rows[0];
    if (row?.baseUrl && row?.apiKey && row?.model) {
      return { baseUrl: row.baseUrl, apiKey: row.apiKey, model: row.model };
    }
  }

  // 2. 查询默认启用的 provider
  const defaultRows = await db
    .select({
      baseUrl: providers.baseUrl,
      apiKey: providers.apiKey,
      model: providers.modelName,
    })
    .from(providers)
    .where(and(eq(providers.isDefault, true), eq(providers.isEnabled, true)))
    .limit(1);

  const defaultRow = defaultRows[0];
  if (defaultRow?.baseUrl && defaultRow?.apiKey && defaultRow?.model) {
    return { baseUrl: defaultRow.baseUrl, apiKey: defaultRow.apiKey, model: defaultRow.model };
  }

  // 3. 回退到 settings 配置
  const settings = await getSettings();
  if (settings.llmBaseUrl && settings.llmApiKey && settings.llmModel) {
    return { baseUrl: settings.llmBaseUrl, apiKey: settings.llmApiKey, model: settings.llmModel };
  }

  return null;
}

export interface StreamOptions {
  prompt: string;
  providerId?: number;
  onFinish?: (text: string) => void | Promise<void>;
}

/**
 * 流式调用 LLM 并输出到 Response
 * 使用 Vercel AI SDK，兼容 useCompletion hook (streamProtocol: 'text')
 *
 * 注意：调用此方法的 API 路由需要添加以下配置以禁用响应缓冲：
 * export const config = { api: { responseLimit: false } };
 */
export async function streamToResponse(
  res: NextApiResponse,
  options: StreamOptions
): Promise<void> {
  const { prompt, providerId, onFinish } = options;

  const llmConfig = await getLLMConfig(providerId);
  if (!llmConfig) {
    res.status(400).json({ error: '请先配置LLM API' });
    return;
  }

  const { streamText } = await import('ai');
  const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

  const provider = createOpenAICompatible({
    name: 'llm-provider',
    baseURL: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
  });

  const result = streamText({
    model: provider.chatModel(llmConfig.model),
    prompt,
    onFinish: onFinish ? ({ text }) => onFinish(text) : undefined,
  });

  // 设置流式响应头，禁用各层缓冲
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');

  // 使用 text stream 协议，前端需要设置 streamProtocol: 'text'
  result.pipeTextStreamToResponse(res);
}

/**
 * 非流式调用 LLM，返回完整文本
 */
export async function generateText(
  prompt: string,
  providerId?: number
): Promise<string> {
  const llmConfig = await getLLMConfig(providerId);
  if (!llmConfig) {
    throw new Error('请先配置LLM API');
  }

  const { generateText: aiGenerateText } = await import('ai');
  const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

  const provider = createOpenAICompatible({
    name: 'llm-provider',
    baseURL: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
  });

  const result = await aiGenerateText({
    model: provider.chatModel(llmConfig.model),
    prompt,
  });

  return result.text;
}
