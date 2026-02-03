import { config } from 'dotenv';
import { resolve } from 'path';

// 加载 .env.local 文件
config({ path: resolve(process.cwd(), '.env.local') });

import { db, schema } from '../src/server/db';
import { loadStorageConfig } from '../src/server/services/storage/config';
import { StorageService } from '../src/server/services/storage/StorageService';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('=== 清理无效 Asset 记录 ===\n');

  // 1. 加载存储配置
  const config = await loadStorageConfig();
  console.log(`存储类型: ${config.type}`);
  const storageService = StorageService.reinitialize(config);

  // 2. 查询所有 asset 记录
  const allAssets = await db.select().from(schema.assets);
  console.log(`总共 ${allAssets.length} 条 asset 记录\n`);

  // 3. 检查每个文件是否存在
  const invalidAssets: number[] = [];
  const validAssets: number[] = [];

  for (const asset of allAssets) {
    try {
      const exists = await storageService.exists(asset.path);
      if (exists) {
        validAssets.push(asset.id);
      } else {
        console.log(`❌ Asset ${asset.id}: ${asset.path} (不存在)`);
        invalidAssets.push(asset.id);
      }
    } catch (error: any) {
      console.log(`❌ Asset ${asset.id}: ${asset.path} (检查失败: ${error.message})`);
      invalidAssets.push(asset.id);
    }
  }

  console.log(`\n有效记录: ${validAssets.length}`);
  console.log(`无效记录: ${invalidAssets.length}\n`);

  if (invalidAssets.length === 0) {
    console.log('✅ 没有需要清理的记录');
    return;
  }

  // 4. 删除无效记录
  console.log('开始清理无效记录...\n');

  for (const assetId of invalidAssets) {
    try {
      // 删除 creative_assets 关联
      await db
        .delete(schema.creativeAssets)
        .where(eq(schema.creativeAssets.assetId, assetId));

      // 删除 asset 记录
      await db
        .delete(schema.assets)
        .where(eq(schema.assets.id, assetId));

      console.log(`✅ 已删除 asset ${assetId}`);
    } catch (error: any) {
      console.error(`❌ 删除 asset ${assetId} 失败:`, error.message);
    }
  }

  console.log(`\n✅ 清理完成！删除了 ${invalidAssets.length} 条无效记录`);
}

main()
  .catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
