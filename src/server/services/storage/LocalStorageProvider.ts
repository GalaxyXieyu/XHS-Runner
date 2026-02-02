import fs from 'fs/promises';
import path from 'path';
import { StorageProvider, StorageOptions } from './types';

/**
 * 本地文件系统存储提供者
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(private basePath: string) {}

  async store(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions
  ): Promise<string> {
    // 构建完整路径
    const subdir = options?.subdir || '';
    const fullDir = path.join(this.basePath, subdir);
    const fullPath = path.join(fullDir, filename);

    // 确保目录存在
    await fs.mkdir(fullDir, { recursive: true });

    // 写入文件
    await fs.writeFile(fullPath, buffer);

    // 返回相对路径
    return path.join(subdir, filename);
  }

  async retrieve(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, filePath);
    return await fs.readFile(fullPath);
  }

  async getUrl(filePath: string): Promise<string> {
    // 本地存储返回相对路径，统一由 /api/assets/{id} 提供访问
    return filePath;
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    await fs.unlink(fullPath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
