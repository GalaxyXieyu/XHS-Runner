/**
 * 直接测试服务层: confirm 逻辑 + creative_assets 关联
 */

import { db, schema } from '../db';
import { enqueueBatch } from '../services/xhs/llm/generationQueue';
import { getContentPackage } from '../services/xhs/content/creativeService';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('=== Service Layer Test ===\n');

  // 1. 创建 creative
  console.log('1. 创建 creative...');
  const [creative] = await db
    .insert(schema.creatives)
    .values({ status: 'generating', model: 'nanobanana' })
    .returning({ id: schema.creatives.id });
  console.log(`   ✅ Creative ID: ${creative.id}`);

  // 2. 入队任务 (使用简单 prompt，不调用 LLM)
  console.log('\n2. 入队生成任务...');
  const tasks = await enqueueBatch([
    { prompt: 'test prompt 1', model: 'nanobanana', creativeId: creative.id },
    { prompt: 'test prompt 2', model: 'nanobanana', creativeId: creative.id },
  ]);
  console.log(`   ✅ 入队 ${tasks.length} 个任务: ${tasks.map((t) => t.id).join(', ')}`);

  // 3. 等待任务处理
  console.log('\n3. 等待任务处理 (10秒)...');
  await new Promise((r) => setTimeout(r, 10000));

  // 4. 检查任务状态
  console.log('\n4. 检查任务状态...');
  for (const task of tasks) {
    const [t] = await db
      .select({ status: schema.generationTasks.status, resultAssetId: schema.generationTasks.resultAssetId })
      .from(schema.generationTasks)
      .where(eq(schema.generationTasks.id, task.id));
    console.log(`   Task #${task.id}: ${t?.status}, asset: ${t?.resultAssetId ?? 'none'}`);
  }

  // 5. 检查 creative_assets 关联
  console.log('\n5. 检查 creative_assets 关联...');
  const relations = await db
    .select()
    .from(schema.creativeAssets)
    .where(eq(schema.creativeAssets.creativeId, creative.id));
  console.log(`   ✅ 关联记录: ${relations.length} 条`);
  relations.forEach((r) => console.log(`      - asset #${r.assetId}`));

  // 6. 查询完整图文包
  console.log('\n6. 查询图文包...');
  const pkg = await getContentPackage(creative.id);
  if (pkg) {
    console.log(`   ✅ Creative #${pkg.creative.id}:`);
    console.log(`      - assets: ${pkg.assets.length}`);
    console.log(`      - tasks: ${pkg.tasks.length}`);
  }

  console.log('\n=== Test 完成 ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
