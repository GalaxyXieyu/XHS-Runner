import { config } from 'dotenv';
import { resolve } from 'path';

// 加载 .env.local 文件
config({ path: resolve(process.cwd(), '.env.local') });

import { storeAsset } from '../src/server/services/xhs/integration/assetStore';
import { loadStorageConfig } from '../src/server/services/storage/config';
import { StorageService } from '../src/server/services/storage/StorageService';

async function main() {
  console.log('=== 测试图片存储流程 ===\n');

  // 1. 检查配置
  const config = await loadStorageConfig();
  console.log('存储配置:');
  console.log(JSON.stringify(config, null, 2));
  console.log();

  // 2. 创建测试图片（1x1 PNG）
  const testImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  console.log(`测试图片大小: ${testImageBuffer.length} bytes\n`);

  // 3. 测试保存
  console.log('开始保存测试图片...');
  try {
    const result = await storeAsset({
      type: 'image',
      filename: `test_${Date.now()}.png`,
      data: testImageBuffer,
      metadata: {
        test: true,
        timestamp: new Date().toISOString(),
      },
    });

    console.log('✅ 保存成功！');
    console.log(`- Asset ID: ${result.id}`);
    console.log(`- Path: ${result.path}`);
    console.log(`- URL: ${result.url}`);
    console.log();

    // 4. 验证文件是否存在
    console.log('验证文件是否存在...');
    const storageService = StorageService.reinitialize(config);
    const exists = await storageService.exists(result.path);
    console.log(`- 文件存在: ${exists ? '✅ 是' : '❌ 否'}`);

    if (exists) {
      // 5. 尝试读取文件
      console.log('\n尝试读取文件...');
      const buffer = await storageService.retrieve(result.path);
      console.log(`✅ 读取成功！大小: ${buffer.length} bytes`);
    }
  } catch (error: any) {
    console.error('❌ 保存失败:', error.message);
    console.error(error);
  }
}

main()
  .catch((error) => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
