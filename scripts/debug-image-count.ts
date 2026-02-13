import { config } from 'dotenv';
import { resolve } from 'path';
import { desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../src/server/db';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const latestCreatives = await db
    .select({
      id: schema.creatives.id,
      themeId: schema.creatives.themeId,
      title: schema.creatives.title,
      createdAt: schema.creatives.createdAt,
    })
    .from(schema.creatives)
    .orderBy(desc(schema.creatives.id))
    .limit(5);

  console.log('=== 最新 creatives (top 5) ===');
  for (const creative of latestCreatives) {
    console.log(`#${creative.id} theme=${creative.themeId ?? '-'} ${creative.title || '(no title)'}`);

    const [assetCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.creativeAssets)
      .where(eq(schema.creativeAssets.creativeId, creative.id));

    const [planCountRow] = await db
      .select({
        total: sql<number>`count(*)`,
        withAsset: sql<number>`count(*) filter (where ${schema.imagePlans.assetId} is not null)`,
      })
      .from(schema.imagePlans)
      .where(eq(schema.imagePlans.creativeId, creative.id));

    console.log(
      `  creative_assets: ${Number(assetCountRow?.count || 0)} | image_plans: ${Number(planCountRow?.total || 0)} (with asset: ${Number(planCountRow?.withAsset || 0)})`
    );
  }

  const recentAssets = await db
    .select({
      id: schema.assets.id,
      type: schema.assets.type,
      path: schema.assets.path,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.assets)
    .orderBy(desc(schema.assets.id))
    .limit(5);

  console.log('\n=== 最新 assets (top 5) ===');
  recentAssets.forEach((asset) => {
    console.log(`#${asset.id} ${asset.type} ${asset.path} (${asset.createdAt?.toISOString() || '-'})`);
  });
}

main().catch((error) => {
  console.error('debug-image-count failed:', error);
  process.exit(1);
});
