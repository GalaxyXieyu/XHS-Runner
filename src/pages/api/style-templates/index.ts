import type { NextApiRequest, NextApiResponse } from 'next';
import { db, schema } from '@/server/db';
import { eq } from 'drizzle-orm';
import { listStyleTemplates } from '@/server/services/xhs/llm/styleTemplateService';

const TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function toPublicTemplate(template: any) {
  return {
    key: template.key,
    name: template.name,
    category: template.category ?? null,
    defaultAspectRatio: template.defaultAspectRatio ?? null,
    isBuiltin: Boolean(template.isBuiltin),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const templates = await listStyleTemplates();
      return res.status(200).json(templates.map(toPublicTemplate));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list templates';
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === 'POST') {
    const { key, name, category, systemPrompt, promptSuffix, defaultAspectRatio } = req.body ?? {};
    const normalizedKey = String(key ?? '').trim();
    const normalizedName = String(name ?? '').trim();
    const normalizedSystemPrompt = String(systemPrompt ?? '').trim();

    if (!TEMPLATE_KEY_PATTERN.test(normalizedKey)) {
      return res.status(400).json({ error: 'key is invalid' });
    }
    if (!normalizedName) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!normalizedSystemPrompt) {
      return res.status(400).json({ error: 'systemPrompt is required' });
    }
    if (normalizedSystemPrompt.length > 8000) {
      return res.status(400).json({ error: 'systemPrompt is too long' });
    }

    const [existing] = await db
      .select({ key: schema.imageStyleTemplates.key, isBuiltin: schema.imageStyleTemplates.isBuiltin })
      .from(schema.imageStyleTemplates)
      .where(eq(schema.imageStyleTemplates.key, normalizedKey))
      .limit(1);

    if (existing) {
      if (existing.isBuiltin) {
        return res.status(409).json({ error: 'key conflicts with builtin template' });
      }
      return res.status(409).json({ error: 'key already exists' });
    }

    try {
      const [created] = await db
        .insert(schema.imageStyleTemplates)
        .values({
          key: normalizedKey,
          name: normalizedName,
          category: category ? String(category).trim() : null,
          systemPrompt: normalizedSystemPrompt,
          promptSuffix: promptSuffix ? String(promptSuffix).trim() : null,
          defaultAspectRatio: defaultAspectRatio ? String(defaultAspectRatio).trim() : null,
          isBuiltin: false,
          isEnabled: true,
        })
        .returning();

      return res.status(201).json(toPublicTemplate(created));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template';
      return res.status(500).json({ error: message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

