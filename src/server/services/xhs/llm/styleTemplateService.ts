import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';
import { expandIdea } from './ideaExpander';

export type AspectRatio = '3:4' | '1:1' | '4:3';

export type IdeaPromptContext = {
  goal?: 'collects' | 'comments' | 'followers';
  persona?: string;
  tone?: string;
  extraRequirements?: string;
};

export async function listStyleTemplates() {
  return db.select().from(schema.imageStyleTemplates).where(eq(schema.imageStyleTemplates.isEnabled, true));
}

export async function getStyleTemplate(key: string) {
  const [template] = await db
    .select()
    .from(schema.imageStyleTemplates)
    .where(eq(schema.imageStyleTemplates.key, key))
    .limit(1);
  return template ?? null;
}

export async function renderStyledPrompts(params: {
  idea: string;
  styleKey: string;
  aspectRatio: AspectRatio;
  count: number;
  context?: IdeaPromptContext;
}): Promise<string[]> {
  const { idea, styleKey, aspectRatio, count, context } = params;

  const template = await getStyleTemplate(styleKey);
  if (!template) {
    return expandIdea(idea, count, { aspectRatio, ...context });
  }

  const prompts = await expandIdea(idea, count, {
    systemPrompt: template.systemPrompt,
    aspectRatio,
    ...context,
  });

  // 附加风格后缀
  if (template.promptSuffix) {
    return prompts.map((p) => p + template.promptSuffix);
  }

  return prompts;
}
