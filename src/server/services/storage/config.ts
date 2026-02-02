import { db } from '../../db';
import { settings } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { StorageConfig } from './types';

/**
 * 从数据库或环境变量加载存储配置
 */
export async function loadStorageConfig(): Promise<StorageConfig> {
  // 优先从环境变量读取
  const storageType = process.env.STORAGE_TYPE as 'local' | 'minio' | undefined;

  if (storageType === 'minio') {
    return {
      type: 'minio',
      minio: {
        endpoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT || '23030'),
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        bucket: process.env.MINIO_BUCKET || 'xhs-assets',
        useSSL: process.env.MINIO_USE_SSL === 'true',
        region: process.env.MINIO_REGION || 'us-east-1',
      },
    };
  }

  // 尝试从数据库读取
  try {
    const [storageSetting] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'storage_config'))
      .limit(1);

    if (storageSetting?.value) {
      const config = JSON.parse(storageSetting.value as string) as StorageConfig;
      return config;
    }
  } catch (error) {
    console.warn('Failed to load storage config from database:', error);
  }

  // 默认使用本地存储
  return {
    type: 'local',
  };
}

/**
 * 保存存储配置到数据库
 */
export async function saveStorageConfig(config: StorageConfig): Promise<void> {
  await db
    .insert(settings)
    .values({
      key: 'storage_config',
      value: JSON.stringify(config),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: JSON.stringify(config),
        updatedAt: new Date(),
      },
    });
}
