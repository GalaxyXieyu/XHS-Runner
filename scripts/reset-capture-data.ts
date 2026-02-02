/**
 * 清理已捕捉的笔记数据与封面/图片缓存
 *
 * 用法:
 *   npx tsx scripts/reset-capture-data.ts --execute
 *   npx tsx scripts/reset-capture-data.ts --execute --keep-assets
 *   npx tsx scripts/reset-capture-data.ts --execute --keep-topics
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../src/server/db';

type Flags = {
  execute: boolean;
  keepAssets: boolean;
  keepTopics: boolean;
};

function parseArgs(argv: string[]): Flags {
  const flags = new Set(argv);
  return {
    execute: flags.has('--execute'),
    keepAssets: flags.has('--keep-assets'),
    keepTopics: flags.has('--keep-topics'),
  };
}

function listPaths(): string[] {
  const paths = new Set<string>();
  const envPath = process.env.XHS_USER_DATA_PATH;
  if (envPath) paths.add(path.join(envPath, 'assets'));

  paths.add(path.join(os.homedir(), '.xhs-runner', 'assets'));
  paths.add(path.join(process.cwd(), 'assets'));
  paths.add(path.join(process.cwd(), '.xhs-data', 'assets'));

  return Array.from(paths);
}

function removePath(targetPath: string) {
  if (!fs.existsSync(targetPath)) return false;
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

async function countRows<T>(query: Promise<T[]>): Promise<number> {
  const rows = await query;
  const raw = (rows?.[0] as any)?.count ?? 0;
  return Number(raw) || 0;
}

async function main() {
  process.env.DOTENV_CONFIG_QUIET = 'true';
  dotenv.config({ path: ['.env.local', '.env'] });

  const { execute, keepAssets, keepTopics } = parseArgs(process.argv.slice(2));

  console.log('\n=== 重置捕捉数据 ===');
  console.log(`Execute: ${execute}`);
  console.log(`Keep assets metadata: ${keepAssets}`);
  console.log(`Keep topics: ${keepTopics}\n`);

  const paths = listPaths();
  console.log('本地缓存目录:');
  paths.forEach((p) => console.log(`  - ${p}`));

  if (!execute) {
    console.log('\n[DRY RUN] 添加 --execute 参数以执行清理');
    return;
  }

  console.log('\nStep 1: 清理本地缓存目录...');
  let removedCount = 0;
  for (const p of paths) {
    if (removePath(p)) {
      removedCount += 1;
      console.log(`  ✅ 已删除 ${p}`);
    } else {
      console.log(`  - 跳过不存在路径 ${p}`);
    }
  }
  if (removedCount === 0) {
    console.log('  - 未发现可删除的本地缓存目录');
  }

  if (!keepTopics) {
    console.log('\nStep 2: 删除捕捉的笔记元数据 (topics.source = xhs)...');
    const topicCount = await countRows(
      db.select({ count: sql<number>`count(*)` })
        .from(schema.topics)
        .where(eq(schema.topics.source, 'xhs'))
    );
    await db.delete(schema.topics).where(eq(schema.topics.source, 'xhs'));
    console.log(`  ✅ 已删除 ${topicCount} 条 topics 记录`);
  } else {
    console.log('\nStep 2: 保留 topics（跳过删除）');
  }

  if (!keepAssets) {
    console.log('\nStep 3: 删除封面/图片资产元数据 (assets, creative_assets)...');
    const assetCount = await countRows(
      db.select({ count: sql<number>`count(*)` }).from(schema.assets)
    );
    await db.delete(schema.creativeAssets);
    await db.delete(schema.assets);
    console.log(`  ✅ 已删除 ${assetCount} 条 assets 记录`);
  } else {
    console.log('\nStep 3: 保留 assets 元数据（跳过删除）');
  }

  console.log('\n✅ 清理完成');
}

main().catch((error) => {
  console.error('重置失败:', error);
  process.exitCode = 1;
});
