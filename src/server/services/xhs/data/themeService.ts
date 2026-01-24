// Theme Service - Drizzle ORM
import { db, schema } from '../../../db/index';
import { desc, eq } from 'drizzle-orm';
import type { Theme, Keyword, Competitor, NewTheme } from '../../../db/schema';

export type { Theme, Keyword, Competitor };

async function listThemeKeywords(themeId: number) {
  return db
    .select({
      id: schema.keywords.id,
      themeId: schema.keywords.themeId,
      value: schema.keywords.value,
      keyword: schema.keywords.keyword,
      source: schema.keywords.source,
      status: schema.keywords.status,
      isEnabled: schema.keywords.isEnabled,
      createdAt: schema.keywords.createdAt,
      updatedAt: schema.keywords.updatedAt,
    })
    .from(schema.keywords)
    .where(eq(schema.keywords.themeId, themeId))
    .orderBy(desc(schema.keywords.id));
}

async function listThemeCompetitors(themeId: number) {
  return db
    .select({
      id: schema.competitors.id,
      themeId: schema.competitors.themeId,
      xhsUserId: schema.competitors.xhsUserId,
      name: schema.competitors.name,
      lastMonitoredAt: schema.competitors.lastMonitoredAt,
      createdAt: schema.competitors.createdAt,
      updatedAt: schema.competitors.updatedAt,
    })
    .from(schema.competitors)
    .where(eq(schema.competitors.themeId, themeId))
    .orderBy(desc(schema.competitors.id));
}

export async function listThemes() {
  const themes = await db
    .select({
      id: schema.themes.id,
      name: schema.themes.name,
      description: schema.themes.description,
      status: schema.themes.status,
      analytics: schema.themes.analytics,
      config: schema.themes.config,
      createdAt: schema.themes.createdAt,
      updatedAt: schema.themes.updatedAt,
    })
    .from(schema.themes)
    .orderBy(desc(schema.themes.id));

  return Promise.all(
    themes.map(async (theme) => ({
      ...theme,
      keywords: await listThemeKeywords(theme.id),
      competitors: await listThemeCompetitors(theme.id),
    }))
  );
}

export async function createTheme(payload: {
  name: string;
  description?: string;
  status?: string;
  analytics?: Record<string, unknown>;
  config?: Record<string, unknown>;
  keywords?: string[];
  competitors?: Array<{ name?: string; xhsUserId?: string } | string>;
}): Promise<Theme> {
  const name = payload.name?.trim();
  if (!name) {
    throw new Error('Theme name is required');
  }

  const [theme] = await db
    .insert(schema.themes)
    .values({
      name,
      description: payload.description ?? null,
      status: payload.status ?? 'active',
      analytics: payload.analytics ?? null,
      config: payload.config ?? null,
    })
    .returning();

  const themeId = theme.id;

  if (Array.isArray(payload.keywords) && payload.keywords.length > 0) {
    const keywordRows = payload.keywords
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .map((value) => ({
        themeId,
        value,
        keyword: value,
        source: 'manual' as const,
        status: 'active' as const,
        isEnabled: true,
      }));

    if (keywordRows.length > 0) {
      await db.insert(schema.keywords).values(keywordRows);
    }
  }

  if (Array.isArray(payload.competitors) && payload.competitors.length > 0) {
    const competitorRows = payload.competitors
      .map((c) => {
        const entry = typeof c === 'object' ? c : { name: c };
        return {
          themeId,
          xhsUserId: entry?.xhsUserId ?? null,
          name: entry?.name ?? null,
        };
      })
      .filter((r) => r.name || r.xhsUserId);

    if (competitorRows.length > 0) {
      await db.insert(schema.competitors).values(competitorRows);
    }
  }

  return theme;
}

export async function updateTheme(payload: {
  id: number;
  name?: string;
  description?: string;
  status?: string;
  analytics?: Record<string, unknown>;
  config?: Record<string, unknown>;
}): Promise<Theme> {
  if (!payload.id) {
    throw new Error('themes:update requires id');
  }

  const updateData: Partial<NewTheme> = { updatedAt: new Date() };
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.analytics !== undefined) updateData.analytics = payload.analytics;
  if (payload.config !== undefined) updateData.config = payload.config;

  const [theme] = await db
    .update(schema.themes)
    .set(updateData)
    .where(eq(schema.themes.id, payload.id))
    .returning();

  if (!theme) {
    throw new Error('Theme not found');
  }

  return theme;
}

export async function removeTheme(id: number): Promise<{ id: number }> {
  if (!id) {
    throw new Error('themes:remove requires id');
  }

  // CASCADE 会自动删除关联的 keywords 和 competitors
  await db.delete(schema.themes).where(eq(schema.themes.id, id));

  return { id };
}

export async function setThemeStatus(id: number, status: string): Promise<Theme> {
  if (!id) {
    throw new Error('themes:setStatus requires id');
  }

  const [theme] = await db
    .update(schema.themes)
    .set({
      status: status || 'active',
      updatedAt: new Date(),
    })
    .where(eq(schema.themes.id, id))
    .returning();

  if (!theme) {
    throw new Error('Theme not found');
  }

  return theme;
}
