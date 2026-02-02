import { db } from '../../db';
import { assets } from '../../db/schema';
import { StorageProvider, StorageConfig, StorageOptions } from './types';
import { LocalStorageProvider } from './LocalStorageProvider';
import { MinIOStorageProvider } from './MinIOStorageProvider';
import { getUserDataPath } from '../../runtime/userDataPath';
import path from 'path';

/**
 * 统一的存储服务
 * 负责文件存储和数据库记录管理
 */
export class StorageService {
  private provider: StorageProvider;
  private static instance: StorageService | null = null;

  private constructor(config: StorageConfig) {
    this.provider = this.createProvider(config);
  }

  /**
   * 获取存储服务单例
   */
  static getInstance(config?: StorageConfig): StorageService {
    if (!StorageService.instance) {
      if (!config) {
        // 默认使用本地存储
        config = {
          type: 'local',
          local: {
            basePath: path.join(getUserDataPath(), 'assets'),
          },
        };
      }
      StorageService.instance = new StorageService(config);
    }
    return StorageService.instance;
  }

  /**
   * 重新初始化存储服务（用于切换存储类型）
   */
  static reinitialize(config: StorageConfig): StorageService {
    StorageService.instance = new StorageService(config);
    return StorageService.instance;
  }

  private createProvider(config: StorageConfig): StorageProvider {
    if (config.type === 'minio' && config.minio) {
      const provider = new MinIOStorageProvider(config.minio);
      // 异步初始化 bucket
      provider.initialize().catch((err) => {
        console.error('Failed to initialize MinIO provider:', err);
      });
      return provider;
    } else {
      // 默认使用本地存储
      const basePath = config.local?.basePath || path.join(getUserDataPath(), 'assets');
      return new LocalStorageProvider(basePath);
    }
  }

  /**
   * 存储资源文件并记录到数据库
   */
  async storeAsset(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions & {
      assetType?: string;
    }
  ): Promise<{
    id: number;
    path: string;
    url: string;
  }> {
    // 存储文件
    const storedPath = await this.provider.store(buffer, filename, options);

    // 记录到数据库
    const [asset] = await db
      .insert(assets)
      .values({
        path: storedPath,
        type: options?.assetType || 'image',
        metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
      })
      .returning();

    return {
      id: asset.id,
      path: storedPath,
      url: `/api/assets/${asset.id}`,
    };
  }

  /**
   * 直接存储文件（不记录数据库）
   */
  async store(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions
  ): Promise<string> {
    return await this.provider.store(buffer, filename, options);
  }

  /**
   * 获取文件内容
   */
  async retrieve(path: string): Promise<Buffer> {
    return await this.provider.retrieve(path);
  }

  /**
   * 获取文件访问 URL
   */
  async getUrl(path: string): Promise<string> {
    return await this.provider.getUrl(path);
  }

  /**
   * 删除文件
   */
  async delete(path: string): Promise<void> {
    await this.provider.delete(path);
  }

  /**
   * 检查文件是否存在
   */
  async exists(path: string): Promise<boolean> {
    return await this.provider.exists(path);
  }
}

/**
 * 获取默认存储服务实例
 */
export function getStorageService(): StorageService {
  return StorageService.getInstance();
}
