import { db } from "../db";
import {
  contentTypeTemplates,
  type ContentTypeTemplate,
  type NewContentTypeTemplate,
} from "../db/schema";
import { desc, eq, and } from "drizzle-orm";

/**
 * 模板结构定义
 */
export interface TemplateStructure {
  cover: {
    role: string;
    description: string;
    layout: string;
    imageCount: number;
  };
  steps?: {
    role: string;
    description: string;
    imageCount: number;
  };
  detail?: {
    role: string;
    description: string;
    imageCount: number;
  };
  result?: {
    role: string;
    description: string;
    imageCount: number;
  };
}

/**
 * 获取所有启用的模板
 */
export async function getAllTemplates(): Promise<ContentTypeTemplate[]> {
  return db
    .select()
    .from(contentTypeTemplates)
    .where(eq(contentTypeTemplates.isEnabled, true))
    .orderBy(contentTypeTemplates.name);
}

/**
 * 获取所有内置模板
 */
export async function getBuiltinTemplates(): Promise<ContentTypeTemplate[]> {
  return db
    .select()
    .from(contentTypeTemplates)
    .where(and(eq(contentTypeTemplates.isBuiltin, true), eq(contentTypeTemplates.isEnabled, true)))
    .orderBy(contentTypeTemplates.name);
}

/**
 * 根据 key 获取模板
 */
export async function getTemplateByKey(key: string): Promise<ContentTypeTemplate | null> {
  const results = await db
    .select()
    .from(contentTypeTemplates)
    .where(and(eq(contentTypeTemplates.key, key), eq(contentTypeTemplates.isEnabled, true)))
    .limit(1);

  return results[0] || null;
}

/**
 * 根据 category 获取模板
 */
export async function getTemplatesByCategory(
  category: string
): Promise<ContentTypeTemplate[]> {
  return db
    .select()
    .from(contentTypeTemplates)
    .where(
      and(eq(contentTypeTemplates.category, category), eq(contentTypeTemplates.isEnabled, true))
    )
    .orderBy(contentTypeTemplates.name);
}

/**
 * 获取模板结构
 */
export async function getTemplateStructure(
  templateKey: string
): Promise<TemplateStructure | null> {
  const template = await getTemplateByKey(templateKey);
  if (!template) return null;

  return template.structure as unknown as TemplateStructure;
}

/**
 * 创建新模板
 */
export async function createTemplate(
  template: NewContentTypeTemplate
): Promise<ContentTypeTemplate> {
  const [result] = await db.insert(contentTypeTemplates).values(template).returning();
  return result;
}

/**
 * 更新模板
 */
export async function updateTemplate(
  key: string,
  updates: Partial<NewContentTypeTemplate>
): Promise<ContentTypeTemplate | null> {
  const [result] = await db
    .update(contentTypeTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(contentTypeTemplates.key, key))
    .returning();

  return result || null;
}

/**
 * 删除模板（软删除：isEnabled = false）
 */
export async function disableTemplate(key: string): Promise<boolean> {
  const [result] = await db
    .update(contentTypeTemplates)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(eq(contentTypeTemplates.key, key));

  return (result.rowCount ?? 0) > 0;
}

/**
 * 获取模板列表（用于 UI 选择）
 */
export async function getTemplateOptions(): Promise<
  Array<{
    key: string;
    name: string;
    description: string;
    category: string;
    exampleImageUrls: string[] | null;
  }>
> {
  const templates = await getAllTemplates();

  return templates.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    category: t.category,
    exampleImageUrls: t.exampleImageUrls,
  }));
}

/**
 * 检查模板是否存在
 */
export async function templateExists(key: string): Promise<boolean> {
  const template = await getTemplateByKey(key);
  return template !== null;
}

/**
 * 预设的内置模板数据
 */
export const BUILTIN_TEMPLATES: NewContentTypeTemplate[] = [
  {
    key: "edu",
    name: "科普教学",
    description: "知识分享、教程、技巧类配图",
    category: "edu",
    structure: {
      cover: {
        role: "封面",
        description: "吸引注意力，传达主题",
        layout: "居中大字标题 + 主题相关视觉元素",
        imageCount: 1,
      },
      steps: {
        role: "步骤图",
        description: "分步骤展示内容",
        imageCount: 2,
      },
      detail: {
        role: "细节图",
        description: "补充信息、深入讲解",
        imageCount: 1,
      },
      result: {
        role: "总结图",
        description: "展示最终效果或总结要点",
        imageCount: 1,
      },
    },
    coverPromptTemplate:
      "【封面设计】主题：{{title}}\n\n要求：\n1. 视觉冲击力强的大字标题\n2. 居中构图，突出主题\n3. 配合{{mood}}氛围，{{colorPalette}}色调\n4. 添加相关图标或插画增强理解\n5. 简洁有力，让用户一眼就知道内容主题\n\n画面描述：",
    contentPromptTemplate:
      "【{{role}}】{{description}}\n\n要求：\n1. 画面清晰，信息传达明确\n2. 配合{{mood}}氛围，{{colorPalette}}色调\n3. 如有步骤，使用数字或箭头清晰标识\n4. 文字说明要醒目但不喧宾夺主\n5. 保持整体风格统一\n\n画面描述：",
    defaultAspectRatio: "3:4",
    exampleImageUrls: [],
    isBuiltin: true,
    isEnabled: true,
    userId: null,
  },
  {
    key: "billboard",
    name: "大字报",
    description: "观点输出、吸引讨论、情绪表达",
    category: "billboard",
    structure: {
      cover: {
        role: "大字报",
        description: "核心观点或情绪表达",
        layout: "大字标题 + 简约背景",
        imageCount: 1,
      },
      detail: {
        role: "补充图",
        description: "展开说明或佐证",
        imageCount: 1,
      },
      result: {
        role: "结尾",
        description: "引导互动或升华主题",
        imageCount: 1,
      },
    },
    coverPromptTemplate:
      "【大字报设计】核心观点：{{title}}\n\n要求：\n1. 超大字号的标题，占据画面主导\n2. 简约背景，让文字成为焦点\n3. {{mood}}氛围，{{colorPalette}}色调\n4. 视觉冲击感强，引发讨论欲望\n5. 可添加少量辅助文字或符号\n\n画面描述：",
    contentPromptTemplate:
      "【{{role}}】{{description}}\n\n要求：\n1. 延续大字报风格，保持视觉统一\n2. 文字与图片平衡，不喧宾夺主\n3. {{mood}}氛围，{{colorPalette}}色调\n4. 引导用户思考或互动\n\n画面描述：",
    defaultAspectRatio: "3:4",
    exampleImageUrls: [],
    isBuiltin: true,
    isEnabled: true,
    userId: null,
  },
  {
    key: "product",
    name: "种草分享",
    description: "产品/餐厅/地点/APP 推荐",
    category: "product",
    structure: {
      cover: {
        role: "封面",
        description: "吸引眼球的推荐主题",
        layout: "产品/场景主图 + 推荐语",
        imageCount: 1,
      },
      steps: {
        role: "展示图",
        description: "多角度/细节展示",
        imageCount: 2,
      },
      result: {
        role: "使用场景",
        description: "真实使用场景或效果",
        imageCount: 1,
      },
    },
    coverPromptTemplate:
      "【种草封面】推荐：{{title}}\n\n要求：\n1. 产品/场景为主角，视觉吸引力强\n2. 真实感、生活化氛围\n3. {{mood}}氛围，{{colorPalette}}色调\n4. 添加简短推荐语或标签\n5. 让人有点赞收藏的冲动\n\n画面描述：",
    contentPromptTemplate:
      "【{{role}}】{{description}}\n\n要求：\n1. 真实、自然的展示\n2. 突出产品特点或服务亮点\n3. {{mood}}氛围，{{colorPalette}}色调\n4. 如有前后对比，效果更佳\n5. 场景感强，让用户代入\n\n画面描述：",
    defaultAspectRatio: "3:4",
    exampleImageUrls: [],
    isBuiltin: true,
    isEnabled: true,
    userId: null,
  },
  {
    key: "story",
    name: "故事叙事",
    description: "个人经历、心情感悟、游记",
    category: "story",
    structure: {
      cover: {
        role: "封面",
        description: "故事开篇，吸引阅读",
        layout: "情感氛围 + 简短引子",
        imageCount: 1,
      },
      steps: {
        role: "过程图",
        description: "故事发展/时间线",
        imageCount: 2,
      },
      result: {
        role: "结尾",
        description: "情感升华或结论",
        imageCount: 1,
      },
    },
    coverPromptTemplate:
      "【故事封面】{{title}}\n\n要求：\n1. 营造情感氛围，引发共鸣\n2. {{mood}}氛围，{{colorPalette}}色调\n3. 可以是场景、物品、或抽象表达\n4. 留下悬念，吸引继续阅读\n5. 真实、有温度的感觉\n\n画面描述：",
    contentPromptTemplate:
      "【{{role}}】{{description}}\n\n要求：\n1. 讲述感、叙事感\n2. {{mood}}氛围，{{colorPalette}}色调\n3. 图片之间有连贯性\n4. 真实记录，情感自然\n5. 让人有代入感\n\n画面描述：",
    defaultAspectRatio: "3:4",
    exampleImageUrls: [],
    isBuiltin: true,
    isEnabled: true,
    userId: null,
  },
];

/**
 * 初始化内置模板
 */
export async function initializeBuiltinTemplates(): Promise<void> {
  for (const template of BUILTIN_TEMPLATES) {
    const exists = await templateExists(template.key);
    if (!exists) {
      await createTemplate(template);
      console.log(`Created builtin template: ${template.key}`);
    }
  }
}
