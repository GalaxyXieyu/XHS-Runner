/**
 * 批量图片生成 Smoke Test
 *
 * 完整流程: idea → LLM 扩展 prompts → 创建 creative → 批量 tasks → 队列生成 → assets
 *
 * 用法:
 *   npx tsx src/server/scripts/batchGenerateSmoke.ts --idea "秋天的咖啡馆" --count 2
 *   npx tsx src/server/scripts/batchGenerateSmoke.ts --idea "秋天的咖啡馆" --count 2 --execute
 */
import dotenv from 'dotenv';
import { expandIdea } from '../services/xhs/llm/ideaExpander';
import { enqueueBatch } from '../services/xhs/llm/generationQueue';
import { db, schema } from '../db';

function parseArgs(argv: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const eqIndex = raw.indexOf('=');
    if (eqIndex >= 0) {
      result[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[raw] = next;
      i += 1;
    } else {
      result[raw] = 'true';
    }
  }
  return result;
}

async function main() {
  process.env.DOTENV_CONFIG_QUIET = 'true';
  dotenv.config({ path: ['.env.local', '.env'] });

  const args = parseArgs(process.argv.slice(2));
  const idea = String(args.idea || '').trim();
  const count = Math.max(1, Math.min(9, Number(args.count) || 2));
  const execute = args.execute === 'true';
  const model = (args.model || 'nanobanana') as 'nanobanana' | 'jimeng';

  if (!idea) {
    console.error('Usage: npx tsx src/server/scripts/batchGenerateSmoke.ts --idea "主题" --count 2 [--execute] [--model nanobanana|jimeng]');
    process.exitCode = 2;
    return;
  }

  console.log(`\n=== 批量图片生成测试 ===`);
  console.log(`Idea: "${idea}"`);
  console.log(`Count: ${count}`);
  console.log(`Model: ${model}`);
  console.log(`Execute: ${execute}\n`);

  // Step 1: LLM 扩展 prompts
  console.log('Step 1: 扩展 idea → prompts...');
  const prompts = await expandIdea(idea, count);
  console.log(`生成了 ${prompts.length} 个 prompts:`);
  prompts.forEach((p, i) => console.log(`  [${i + 1}] ${p.slice(0, 80)}...`));

  if (!execute) {
    console.log('\n[DRY RUN] 添加 --execute 参数来实际执行生成任务');
    return;
  }

  // Step 2: 创建 creative
  console.log('\nStep 2: 创建 creative...');
  const [creative] = await db
    .insert(schema.creatives)
    .values({
      title: null,
      content: null,
      status: 'draft',
      model,
      prompt: idea,
    })
    .returning({ id: schema.creatives.id });
  console.log(`Creative ID: ${creative.id}`);

  // Step 3: 批量创建 tasks
  console.log('\nStep 3: 创建 generation_tasks...');
  const tasks = await enqueueBatch(
    prompts.map((prompt) => ({
      prompt,
      model,
      creativeId: creative.id,
    }))
  );
  console.log(`创建了 ${tasks.length} 个任务:`);
  tasks.forEach((t) => console.log(`  Task ID: ${t.id}`));

  console.log('\n=== 完成 ===');
  console.log(JSON.stringify({
    creativeId: creative.id,
    taskIds: tasks.map((t) => t.id),
    prompts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
