import { db, schema } from '@/server/db';
import { eq, desc, and, SQL } from 'drizzle-orm';

export interface ContentPackage {
  creative: typeof schema.creatives.$inferSelect;
  assets: (typeof schema.assets.$inferSelect)[];
  tasks: (typeof schema.generationTasks.$inferSelect)[];
}

export async function getContentPackage(creativeId: number): Promise<ContentPackage | null> {
  const [creative] = await db
    .select()
    .from(schema.creatives)
    .where(eq(schema.creatives.id, creativeId))
    .limit(1);

  if (!creative) return null;

  const [assets, tasks] = await Promise.all([
    db
      .select({ asset: schema.assets, sortOrder: schema.creativeAssets.sortOrder })
      .from(schema.creativeAssets)
      .innerJoin(schema.assets, eq(schema.creativeAssets.assetId, schema.assets.id))
      .where(eq(schema.creativeAssets.creativeId, creativeId))
      .orderBy(schema.creativeAssets.sortOrder),
    db
      .select()
      .from(schema.generationTasks)
      .where(eq(schema.generationTasks.creativeId, creativeId)),
  ]);

  return {
    creative,
    assets: assets.map((a) => a.asset),
    tasks,
  };
}

export async function listContentPackages(filters: {
  status?: string;
  themeId?: number;
  limit?: number;
  offset?: number;
}): Promise<ContentPackage[]> {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(schema.creatives.status, filters.status));
  if (filters.themeId) conditions.push(eq(schema.creatives.themeId, filters.themeId));

  const creatives = await db
    .select()
    .from(schema.creatives)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.creatives.createdAt))
    .limit(filters.limit ?? 20)
    .offset(filters.offset ?? 0);

  const packages = await Promise.all(creatives.map((c) => getContentPackage(c.id)));
  return packages.filter((p): p is ContentPackage => p !== null);
}
