// Themes Repository - Theme CRUD operations with Drizzle
import { db, schema } from '../db/index';
import { ensureKeywordSequence } from '../db/sequenceUtils';
import { desc, eq, and } from 'drizzle-orm';
import type { Theme, Keyword, Competitor } from '../db/schema';

export type { Theme, Keyword, Competitor };

export class ThemesRepo {
  // List all themes with their keywords and competitors
  async listWithRelations() {
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
      themes.map(async (theme) => {
        const keywords = await this.listKeywords(theme.id);
        const competitors = await this.listCompetitors(theme.id);
        return { ...theme, keywords, competitors };
      })
    );
  }

  // Get theme by ID
  async findById(id: number) {
    const [theme] = await db
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
      .where(eq(schema.themes.id, id));
    return theme ?? null;
  }

  // Create theme with keywords and competitors
  async create(data: {
    name: string;
    description?: string;
    status?: string;
    analytics?: Record<string, unknown>;
    config?: Record<string, unknown>;
    keywords?: string[];
    competitors?: Array<{ name?: string; xhsUserId?: string }>;
  }) {
    if (!data.name?.trim()) {
      throw new Error('Theme name is required');
    }

    const [theme] = await db
      .insert(schema.themes)
      .values({
        name: data.name.trim(),
        description: data.description ?? null,
        status: data.status ?? 'active',
        analytics: data.analytics ?? null,
        config: data.config ?? null,
      })
      .returning();

    const themeId = theme.id;

    if (Array.isArray(data.keywords) && data.keywords.length > 0) {
      await this.addKeywords(themeId, data.keywords);
    }

    if (Array.isArray(data.competitors) && data.competitors.length > 0) {
      await this.addCompetitors(themeId, data.competitors);
    }

    return theme;
  }

  // Update theme
  async update(id: number, data: Partial<Theme>) {
    const [theme] = await db
      .update(schema.themes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.themes.id, id))
      .returning();

    if (!theme) {
      throw new Error('Theme not found');
    }
    return theme;
  }

  // Delete theme (cascades to keywords, competitors)
  async delete(id: number) {
    await db.delete(schema.themes).where(eq(schema.themes.id, id));
    return { id };
  }

  // Set theme status
  async setStatus(id: number, status: string) {
    const [theme] = await db
      .update(schema.themes)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.themes.id, id))
      .returning();

    if (!theme) {
      throw new Error('Theme not found');
    }
    return theme;
  }

  // Keywords operations
  private async listKeywords(themeId: number) {
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

  async addKeywords(themeId: number, keywords: string[]) {
    const rows = keywords
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

    if (rows.length > 0) {
      await ensureKeywordSequence();
      await db.insert(schema.keywords).values(rows);
    }
    return rows.length;
  }

  async removeKeyword(id: number) {
    await db.delete(schema.keywords).where(eq(schema.keywords.id, id));
    return { id };
  }

  // Competitors operations
  private async listCompetitors(themeId: number) {
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

  async addCompetitors(
    themeId: number,
    competitors: Array<{ name?: string; xhsUserId?: string }>
  ) {
    const rows = competitors
      .map((c) => ({
        themeId,
        xhsUserId: c.xhsUserId ?? null,
        name: c.name ?? null,
      }))
      .filter((r) => r.name || r.xhsUserId);

    if (rows.length > 0) {
      await db.insert(schema.competitors).values(rows);
    }
    return rows.length;
  }

  async removeCompetitor(id: number) {
    await db.delete(schema.competitors).where(eq(schema.competitors.id, id));
    return { id };
  }
}

export const themesRepo = new ThemesRepo();
