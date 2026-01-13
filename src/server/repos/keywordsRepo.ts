// Keywords Repository - Keyword CRUD operations with Drizzle
import { db, schema } from '../db/index';
import { desc, eq, and, or, like } from 'drizzle-orm';
import type { Keyword } from '../db/schema';

export type { Keyword };

export class KeywordsRepo {
  // List all keywords
  async findAll() {
    return db
      .select({
        id: schema.keywords.id,
        themeId: schema.keywords.themeId,
        value: schema.keywords.value,
        keyword: schema.keywords.keyword,
        source: schema.keywords.source,
        priority: schema.keywords.priority,
        status: schema.keywords.status,
        sourceRefId: schema.keywords.sourceRefId,
        sourceMeta: schema.keywords.sourceMeta,
        isEnabled: schema.keywords.isEnabled,
        createdAt: schema.keywords.createdAt,
        updatedAt: schema.keywords.updatedAt,
      })
      .from(schema.keywords)
      .orderBy(desc(schema.keywords.id));
  }

  // Get by ID
  async findById(id: number) {
    const [keyword] = await db
      .select({
        id: schema.keywords.id,
        themeId: schema.keywords.themeId,
        value: schema.keywords.value,
        keyword: schema.keywords.keyword,
        source: schema.keywords.source,
        priority: schema.keywords.priority,
        status: schema.keywords.status,
        sourceRefId: schema.keywords.sourceRefId,
        sourceMeta: schema.keywords.sourceMeta,
        isEnabled: schema.keywords.isEnabled,
        createdAt: schema.keywords.createdAt,
        updatedAt: schema.keywords.updatedAt,
      })
      .from(schema.keywords)
      .where(eq(schema.keywords.id, id));
    return keyword ?? null;
  }

  // Find by theme ID
  async findByThemeId(themeId: number) {
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

  // Find enabled keywords by theme
  async findEnabledByThemeId(themeId: number) {
    return db
      .select({
        id: schema.keywords.id,
        value: schema.keywords.value,
        keyword: schema.keywords.keyword,
      })
      .from(schema.keywords)
      .where(
        and(
          eq(schema.keywords.themeId, themeId),
          eq(schema.keywords.isEnabled, true)
        )
      );
  }

  // Create or get existing keyword (upsert by value)
  async upsert(value: string, data?: Partial<Keyword>) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Keyword value is required');
    }

    const [keyword] = await db
      .insert(schema.keywords)
      .values({
        value: trimmed,
        keyword: trimmed,
        source: data?.source ?? 'manual',
        status: data?.status ?? 'active',
        isEnabled: data?.isEnabled ?? true,
        themeId: data?.themeId ?? null,
        priority: data?.priority ?? null,
        sourceRefId: data?.sourceRefId ?? null,
        sourceMeta: data?.sourceMeta ?? null,
      })
      .onConflictDoUpdate({
        target: schema.keywords.value,
        set: {
          keyword: trimmed,
          updatedAt: new Date(),
        },
      })
      .returning();

    return keyword;
  }

  // Create keyword
  async create(data: Partial<Keyword>) {
    if (!data.value?.trim()) {
      throw new Error('Keyword value is required');
    }

    const [keyword] = await db
      .insert(schema.keywords)
      .values({
        value: data.value.trim(),
        keyword: data.keyword ?? data.value.trim(),
        source: data.source ?? 'manual',
        status: data.status ?? 'active',
        isEnabled: data.isEnabled ?? true,
        themeId: data.themeId ?? null,
        priority: data.priority ?? null,
        sourceRefId: data.sourceRefId ?? null,
        sourceMeta: data.sourceMeta ?? null,
      })
      .returning();

    return keyword;
  }

  // Update keyword
  async update(id: number, data: Partial<Keyword>) {
    const [keyword] = await db
      .update(schema.keywords)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.keywords.id, id))
      .returning();

    if (!keyword) {
      throw new Error('Keyword not found');
    }
    return keyword;
  }

  // Set enabled status
  async setEnabled(id: number, isEnabled: boolean) {
    const [keyword] = await db
      .update(schema.keywords)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(schema.keywords.id, id))
      .returning();

    if (!keyword) {
      throw new Error('Keyword not found');
    }
    return keyword;
  }

  // Delete keyword
  async delete(id: number) {
    await db.delete(schema.keywords).where(eq(schema.keywords.id, id));
    return { id };
  }

  // Search keywords
  async search(query: string) {
    return db
      .select({
        id: schema.keywords.id,
        value: schema.keywords.value,
        keyword: schema.keywords.keyword,
      })
      .from(schema.keywords)
      .where(or(like(schema.keywords.value, `%${query}%`), like(schema.keywords.keyword, `%${query}%`)))
      .limit(10);
  }
}

export const keywordsRepo = new KeywordsRepo();
