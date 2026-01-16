/**
 * 模型选择器 - 根据任务类型选择合适的 LLM 模型
 */

import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';

export type TaskType = 'vision' | 'text' | 'image_gen';

/**
 * 根据任务类型选择合适的模型
 * @param taskType - 任务类型: vision (需要看图), text (纯文本), image_gen (图片生成)
 * @returns 匹配的 LLM Provider 配置
 */
export async function selectModelForTask(taskType: TaskType) {
  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isEnabled, true));

  if (providers.length === 0) {
    throw new Error('未配置任何 LLM 模型，请在设置页面添加模型配置。');
  }

  if (taskType === 'vision') {
    const visionModel = providers.find(p => p.supportsVision);
    if (!visionModel) {
      throw new Error(
        '需要多模态模型（支持图片输入），但未配置。请添加 GPT-4o 或 Gemini 等支持 Vision 的模型，并在设置中勾选"支持图片输入"。'
      );
    }
    return visionModel;
  }

  if (taskType === 'image_gen') {
    const genModel = providers.find(p => p.supportsImageGen);
    if (!genModel) {
      throw new Error(
        '需要图片生成模型，但未配置。请添加 GPT-4o 或 Gemini 等支持图片生成的模型，并在设置中勾选"支持图片生成"。'
      );
    }
    return genModel;
  }

  // 默认文本模型：优先使用默认模型，否则使用第一个
  return providers.find(p => p.isDefault) || providers[0];
}

/**
 * 获取所有支持 Vision 的模型
 */
export async function getVisionModels() {
  return db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isEnabled, true))
    .then(providers => providers.filter(p => p.supportsVision));
}

/**
 * 获取所有支持图片生成的模型
 */
export async function getImageGenModels() {
  return db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isEnabled, true))
    .then(providers => providers.filter(p => p.supportsImageGen));
}
