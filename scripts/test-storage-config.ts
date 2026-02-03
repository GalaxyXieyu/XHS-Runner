import { loadStorageConfig } from '../src/server/services/storage/config';
import { StorageService } from '../src/server/services/storage/StorageService';

async function main() {
  console.log('=== 存储配置测试 ===\n');

  // 1. 检查配置
  const config = await loadStorageConfig();
  console.log('当前存储配置:');
  console.log(JSON.stringify(config, null, 2));
  console.log();

  // 2. 测试存储服务
  const storageService = StorageService.reinitialize(config);

  if (config.type === 'minio') {
    console.log('MinIO 配置检测:');
    console.log(`- Endpoint: ${config.minio?.endpoint}:${config.minio?.port}`);
    console.log(`- Bucket: ${config.minio?.bucket}`);
    console.log(`- SSL: ${config.minio?.useSSL}`);
    console.log();

    // 测试文件是否存在
    const testPath = 'img_1770088930358_0.png';
    console.log(`测试文件: ${testPath}`);
    try {
      const exists = await storageService.exists(testPath);
      console.log(`- 文件存在: ${exists}`);
    } catch (error: any) {
      console.error(`- 检查失败: ${error.message}`);
    }
  } else {
    console.log('使用本地存储');
  }
}

main().catch(console.error);
