import { db, schema } from '../index';

const STYLE_TEMPLATES = [
  {
    key: 'cozy',
    name: '温馨治愈',
    category: 'lifestyle',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长温馨治愈风格。
生成的图片描述应该：
- 使用暖色调（米色、奶油色、淡粉色）
- 强调柔和的自然光线
- 营造舒适、放松的氛围
- 包含温暖的生活细节（毛毯、热饮、绿植等）`,
    promptSuffix: ', warm cozy atmosphere, soft natural lighting, pastel colors, comfortable aesthetic',
    defaultAspectRatio: '3:4',
    isBuiltin: true,
  },
  {
    key: 'minimal',
    name: '极简设计',
    category: 'design',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长极简设计风格。
生成的图片描述应该：
- 大量留白，简洁构图
- 使用中性色调（白、灰、黑、米色）
- 几何线条，干净利落
- 强调质感和细节`,
    promptSuffix: ', minimalist design, clean lines, white space, neutral colors, modern aesthetic',
    defaultAspectRatio: '1:1',
    isBuiltin: true,
  },
  {
    key: 'illustration',
    name: '手绘插画',
    category: 'art',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长手绘插画风格。
生成的图片描述应该：
- 手绘质感，艺术感强
- 色彩丰富但和谐
- 有故事性和情感表达
- 线条流畅，细节丰富`,
    promptSuffix: ', hand-drawn illustration style, artistic, colorful, whimsical, detailed linework',
    defaultAspectRatio: '3:4',
    isBuiltin: true,
  },
  {
    key: 'ink',
    name: '水墨书法',
    category: 'art',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长中国水墨风格。
生成的图片描述应该：
- 传统水墨画风格
- 留白意境，虚实结合
- 黑白灰为主，点缀淡彩
- 有东方美学韵味`,
    promptSuffix: ', Chinese ink wash painting style, traditional, zen aesthetic, black and white with subtle colors',
    defaultAspectRatio: '3:4',
    isBuiltin: true,
  },
  {
    key: 'anime',
    name: '日漫二次元',
    category: 'art',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长日系动漫风格。
生成的图片描述应该：
- 日本动漫画风
- 明亮鲜艳的色彩
- 大眼睛、精致五官（如有人物）
- 梦幻、可爱的氛围`,
    promptSuffix: ', anime style, Japanese animation, vibrant colors, kawaii aesthetic, detailed',
    defaultAspectRatio: '3:4',
    isBuiltin: true,
  },
  {
    key: '3d',
    name: '3D立体',
    category: 'design',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长3D立体风格。
生成的图片描述应该：
- 三维渲染效果
- 立体感强，有深度
- 光影效果精致
- 材质质感真实`,
    promptSuffix: ', 3D render, volumetric lighting, realistic materials, depth of field, octane render',
    defaultAspectRatio: '1:1',
    isBuiltin: true,
  },
  {
    key: 'cyberpunk',
    name: '赛博朋克',
    category: 'design',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长赛博朋克风格。
生成的图片描述应该：
- 霓虹灯光效果
- 紫色、蓝色、粉色为主
- 科技感、未来感
- 城市夜景、电子元素`,
    promptSuffix: ', cyberpunk style, neon lights, purple and blue tones, futuristic, high tech low life',
    defaultAspectRatio: '16:9',
    isBuiltin: true,
  },
  {
    key: 'photo',
    name: '真实摄影',
    category: 'photography',
    systemPrompt: `你是一个专业的小红书配图创意专家，擅长真实摄影风格。
生成的图片描述应该：
- 高清真实的摄影效果
- 专业的构图和光线
- 自然的色彩和质感
- 有故事性的画面`,
    promptSuffix: ', professional photography, high resolution, natural lighting, realistic, DSLR quality',
    defaultAspectRatio: '3:4',
    isBuiltin: true,
  },
];

export async function seedStyleTemplates() {
  console.log('Seeding style templates...');

  for (const template of STYLE_TEMPLATES) {
    await db
      .insert(schema.imageStyleTemplates)
      .values(template)
      .onConflictDoUpdate({
        target: schema.imageStyleTemplates.key,
        set: {
          name: template.name,
          category: template.category,
          systemPrompt: template.systemPrompt,
          promptSuffix: template.promptSuffix,
          defaultAspectRatio: template.defaultAspectRatio,
          isBuiltin: template.isBuiltin,
        },
      });
  }

  console.log(`Seeded ${STYLE_TEMPLATES.length} style templates`);
}

// 直接运行时执行 seed
if (require.main === module) {
  seedStyleTemplates()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
