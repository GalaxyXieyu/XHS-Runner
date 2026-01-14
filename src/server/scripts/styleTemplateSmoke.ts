/**
 * Smoke test for style template system (Phase 2-4)
 * 测试: 风格模板 → 预览 → 确认生成 → 查询图文包
 */

import { listStyleTemplates, getStyleTemplate, renderStyledPrompts } from '../services/xhs/llm/styleTemplateService';
import { getContentPackage, listContentPackages } from '../services/xhs/content/creativeService';
import { db, schema } from '../db';
import { desc } from 'drizzle-orm';

async function main() {
  console.log('=== Style Template Smoke Test ===\n');

  // 1. 测试风格模板列表
  console.log('1. 测试 listStyleTemplates...');
  const templates = await listStyleTemplates();
  console.log(`   ✅ 获取到 ${templates.length} 个风格模板`);
  templates.forEach((t) => console.log(`      - ${t.key}: ${t.name}`));

  // 2. 测试获取单个模板
  console.log('\n2. 测试 getStyleTemplate("cozy")...');
  const cozy = await getStyleTemplate('cozy');
  if (!cozy) {
    console.log('   ❌ 未找到 cozy 模板');
    process.exit(1);
  }
  console.log(`   ✅ 模板: ${cozy.name}, 比例: ${cozy.defaultAspectRatio}`);

  // 3. 测试 renderStyledPrompts (需要 LLM)
  console.log('\n3. 测试 renderStyledPrompts...');
  try {
    const prompts = await renderStyledPrompts({
      idea: '秋天的咖啡馆',
      styleKey: 'cozy',
      aspectRatio: '3:4',
      count: 2,
    });
    console.log(`   ✅ 生成 ${prompts.length} 个 prompts:`);
    prompts.forEach((p, i) => console.log(`      ${i + 1}. ${p.slice(0, 60)}...`));
  } catch (err) {
    console.log(`   ⚠️ LLM 调用失败 (可能未配置): ${(err as Error).message}`);
  }

  // 4. 测试 creative_assets 关联查询
  console.log('\n4. 测试 listContentPackages...');
  const packages = await listContentPackages({ limit: 3 });
  console.log(`   ✅ 获取到 ${packages.length} 个图文包`);
  packages.forEach((pkg) => {
    console.log(`      - Creative #${pkg.creative.id}: ${pkg.assets.length} assets, ${pkg.tasks.length} tasks`);
  });

  // 5. 测试单个图文包查询
  if (packages.length > 0) {
    console.log('\n5. 测试 getContentPackage...');
    const pkg = await getContentPackage(packages[0].creative.id);
    if (pkg) {
      console.log(`   ✅ Creative #${pkg.creative.id}:`);
      console.log(`      - status: ${pkg.creative.status}`);
      console.log(`      - assets: ${pkg.assets.length}`);
      console.log(`      - tasks: ${pkg.tasks.length}`);
    }
  }

  // 6. 检查数据库表
  console.log('\n6. 检查数据库表...');
  const [styleCount] = await db.select({ count: schema.imageStyleTemplates.id }).from(schema.imageStyleTemplates);
  const [assetRelCount] = await db.select({ count: schema.creativeAssets.id }).from(schema.creativeAssets);
  console.log(`   ✅ image_style_templates: ${styleCount?.count ?? 0} 条`);
  console.log(`   ✅ creative_assets: ${assetRelCount?.count ?? 0} 条`);

  console.log('\n=== Smoke Test 完成 ===');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
