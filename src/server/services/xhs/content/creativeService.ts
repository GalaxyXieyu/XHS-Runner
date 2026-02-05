import { db, schema } from '@/server/db';
import { eq, desc, and, SQL, inArray, asc, notInArray } from 'drizzle-orm';

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
  excludeStatuses?: string[];
  themeId?: number;
  limit?: number;
  offset?: number;
}): Promise<ContentPackage[]> {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(schema.creatives.status, filters.status));
  if (filters.excludeStatuses && filters.excludeStatuses.length > 0) {
    conditions.push(notInArray(schema.creatives.status, filters.excludeStatuses));
  }
  if (filters.themeId) conditions.push(eq(schema.creatives.themeId, filters.themeId));

  const creatives = await db
    .select()
    .from(schema.creatives)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.creatives.createdAt))
    .limit(filters.limit ?? 20)
    .offset(filters.offset ?? 0);

  if (creatives.length === 0) return [];

  const creativeIds = creatives.map((c) => c.id);

  const [assetRows, tasks] = await Promise.all([
    db
      .select({
        creativeId: schema.creativeAssets.creativeId,
        sortOrder: schema.creativeAssets.sortOrder,
        asset: schema.assets,
      })
      .from(schema.creativeAssets)
      .innerJoin(schema.assets, eq(schema.creativeAssets.assetId, schema.assets.id))
      .where(inArray(schema.creativeAssets.creativeId, creativeIds))
      .orderBy(asc(schema.creativeAssets.creativeId), asc(schema.creativeAssets.sortOrder)),
    db
      .select()
      .from(schema.generationTasks)
      .where(inArray(schema.generationTasks.creativeId, creativeIds)),
  ]);

  const assetsByCreative = new Map<number, Array<{ sortOrder: number; asset: typeof schema.assets.$inferSelect }>>();
  for (const row of assetRows) {
    const bucket = assetsByCreative.get(row.creativeId) ?? [];
    bucket.push({ sortOrder: row.sortOrder ?? 0, asset: row.asset });
    assetsByCreative.set(row.creativeId, bucket);
  }

  const tasksByCreative = new Map<number, Array<typeof schema.generationTasks.$inferSelect>>();
  for (const task of tasks) {
    if (task.creativeId == null) continue;
    const bucket = tasksByCreative.get(task.creativeId) ?? [];
    bucket.push(task);
    tasksByCreative.set(task.creativeId, bucket);
  }

  return creatives.map((creative) => {
    const assets = (assetsByCreative.get(creative.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => a.asset);

    return {
      creative,
      assets,
      tasks: tasksByCreative.get(creative.id) ?? [],
    };
  });
}
