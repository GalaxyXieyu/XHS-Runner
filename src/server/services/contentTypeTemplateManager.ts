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
`【封面设计】主题：{{title}}

## 画面要求
1. 画面中央必须有一个醒目的大字标题牌或文字区域
2. 标题文字内容必须是："{{title}}"
3. 标题必须用英文双引号括起来，例如："{{title}}"
4. 标题字体要清晰、大小适中，占据画面上方 1/3
5. 背景要有视觉吸引力但不抢文字风头

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 标题文字："{{title}}"（必须出现在画面中央顶部）
2. 主题相关的装饰元素或插画
3. 小红书风格的高清质感

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如：标题是"{{title}}"，不是 {{title}}

## 画面描述（详细说明画面内容）
画面中央上方是一个醒目的标题牌，上面写着："{{title}}"
标题下方是{{mood}}风格的背景，使用{{colorPalette}}色调
背景中有与主题相关的视觉元素`,
    contentPromptTemplate:
`【{{role}}】{{description}}

## 画面要求
1. 画面清晰，信息传达明确
2. 画面中必须包含关键文字说明，每个文字内容都要用英文引号括起来
3. 例如：步骤说明文字"第一步：xxx"，或者关键概念"核心要点：xxx"

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 文字标签/说明牌，用引号括起来
2. 与{{description}}相关的视觉元素
3. 步骤编号（如果是步骤图）
4. 小红书风格的高清质感

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如："第一步操作"、"关键要点"、"注意事项"

## 画面描述（详细说明画面内容）
画面顶部或中央有文字说明区域，写着："{{description}}"
画面主体展示{{description}}的内容
使用{{mood}}氛围，{{colorPalette}}色调
如果有步骤，使用清晰的数字标识`,
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
`【大字报设计】核心观点：{{title}}

## 画面要求
1. 画面中央必须有超大字号的标题牌
2. 标题文字内容必须是："{{title}}"
3. 标题必须用英文双引号括起来，例如："{{title}}"
4. 标题占据画面主导地位，字号超大
5. 背景简约，让文字成为唯一焦点

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 核心标题："{{title}}"（画面中央，超大字）
2. 简约背景色块，突出文字
3. 可添加少量辅助文字（用引号括起来）

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如：标题是"{{title}}"，不是 {{title}}

## 画面描述（详细说明画面内容）
画面中央是一个超大号的标题牌，上面写着："{{title}}"
标题字大醒目，占据画面中央 80% 面积
背景使用{{colorPalette}}色调的简约色块{{mood}}氛围
可以在标题下方添加小字辅助说明："引导语或标签"`,
    contentPromptTemplate:
`【{{role}}】{{description}}

## 画面要求
1. 延续大字报风格，保持视觉统一
2. 画面中必须包含文字说明，用英文引号括起来
3. 文字与简约背景平衡，不喧宾夺主

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 主要文字："{{description}}"（用引号括起来）
2. 简约背景，{{colorPalette}}色调
3. 辅助说明文字（如果需要）

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如："{{description}}"

## 画面描述（详细说明画面内容）
画面上方或中央有文字区域，写着："{{description}}"
使用{{mood}}氛围，{{colorPalette}}色调
背景简约，突出文字内容`,
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
`【种草封面】推荐：{{title}}

## 画面要求
1. 产品/场景为主角，视觉吸引力强
2. 画面中央必须有标题文字区域
3. 标题文字内容必须是："{{title}}"
4. 标题必须用英文双引号括起来
5. 真实感、生活化氛围

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 标题文字："{{title}}"（画面上方或中央）
2. 产品/场景主图
3. 推荐语标签："推荐理由"（用引号括起来）

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如：标题是"{{title}}"

## 画面描述（详细说明画面内容）
画面上方有标题牌，写着："{{title}}"
画面中央是产品或场景主图{{mood}}风格
使用{{colorPalette}}色调，真实生活化氛围
可以在角落添加小标签："必Buy"、"亲测推荐"`,
    contentPromptTemplate:
`【{{role}}】{{description}}

## 画面要求
1. 真实、自然的展示，突出产品特点
2. 画面中必须包含文字说明，用英文引号括起来
3. 如有前后对比，要清晰标识

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 文字标签："{{description}}"（用引号括起来）
2. 产品/服务展示
3. 关键卖点标签

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如："{{description}}"、"产品亮点：xxx"

## 画面描述（详细说明画面内容）
画面中有文字说明区域，写着："{{description}}"
画面展示{{description}}的内容{{mood}}氛围
使用{{colorPalette}}色调，突出产品特点`,
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
`【故事封面】{{title}}

## 画面要求
1. 营造情感氛围，引发共鸣
2. 画面中央必须有标题文字
3. 标题文字内容必须是："{{title}}"
4. 标题必须用英文双引号括起来
5. 留下悬念，吸引继续阅读

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 标题文字："{{title}}"（画面上方或中央）
2. 情感氛围场景或物品
3. 引子文字："故事开始"或类似（用引号括起来）

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如：标题是"{{title}}"

## 画面描述（详细说明画面内容）
画面上方有标题牌，写着："{{title}}"
画面营造{{mood}}情感氛围{{colorPalette}}色调
使用场景、物品或抽象表达{{mood}}氛围
真实、有温度的感觉`,
    contentPromptTemplate:
`【{{role}}】{{description}}

## 画面要求
1. 讲述感、叙事感，图片之间有连贯性
2. 画面中必须包含文字说明，用英文引号括起来
3. 真实记录，情感自然

## 风格要求
- 氛围：{{mood}}
- 色调：{{colorPalette}}
- 光线：{{lighting}}
- 竖版 3:4 比例

## 必须包含的元素
1. 文字说明："{{description}}"（用引号括起来）
2. 故事相关内容展示
3. 情感标签

## 文字格式规范
- 所有显示在画面中的文字必须用英文引号括起来
- 例如："{{description}}"

## 画面描述（详细说明画面内容）
画面中有文字说明，写着："{{description}}"
画面展示{{description}}的内容{{mood}}氛围
使用{{colorPalette}}色调，真实自然
让人有代入感`,
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
