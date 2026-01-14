/**
 * 端到端测试: preview → confirm → 查询图文包
 */

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('=== E2E Test: Preview → Confirm → Query ===\n');

  // 1. 调用 preview API
  console.log('1. POST /api/generate/preview...');
  const previewRes = await fetch(`${BASE_URL}/api/generate/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idea: '冬日暖阳下的猫咪',
      styleKey: 'cozy',
      aspectRatio: '3:4',
      count: 2,
    }),
  });

  if (!previewRes.ok) {
    console.log(`   ❌ Preview failed: ${previewRes.status}`);
    const err = await previewRes.text();
    console.log(`   Error: ${err}`);
    process.exit(1);
  }

  const preview = await previewRes.json();
  console.log(`   ✅ 生成 ${preview.prompts.length} 个 prompts`);
  console.log(`   Style: ${preview.styleTemplate?.name || 'default'}`);
  preview.prompts.forEach((p: string, i: number) => console.log(`   ${i + 1}. ${p.slice(0, 50)}...`));

  // 2. 调用 confirm API
  console.log('\n2. POST /api/generate/confirm...');
  const confirmRes = await fetch(`${BASE_URL}/api/generate/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: preview.prompts,
      model: 'nanobanana',
    }),
  });

  if (!confirmRes.ok) {
    console.log(`   ❌ Confirm failed: ${confirmRes.status}`);
    const err = await confirmRes.text();
    console.log(`   Error: ${err}`);
    process.exit(1);
  }

  const confirm = await confirmRes.json();
  console.log(`   ✅ Creative ID: ${confirm.creativeId}`);
  console.log(`   Task IDs: ${confirm.taskIds.join(', ')}`);
  console.log(`   Status: ${confirm.status}`);

  // 3. 等待任务完成并查询
  console.log('\n3. 等待 5 秒后查询图文包...');
  await new Promise((r) => setTimeout(r, 5000));

  const queryRes = await fetch(`${BASE_URL}/api/creatives/${confirm.creativeId}`);
  if (!queryRes.ok) {
    console.log(`   ❌ Query failed: ${queryRes.status}`);
    process.exit(1);
  }

  const pkg = await queryRes.json();
  console.log(`   ✅ Creative #${pkg.creative.id}:`);
  console.log(`      - status: ${pkg.creative.status}`);
  console.log(`      - assets: ${pkg.assets.length}`);
  console.log(`      - tasks: ${pkg.tasks.length}`);
  pkg.tasks.forEach((t: any) => console.log(`        Task #${t.id}: ${t.status}`));

  console.log('\n=== E2E Test 完成 ===');
}

main().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
