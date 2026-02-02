/**
 * 对象存储服务类型定义
 */

/**
 * 存储提供者接口
 */
export interface StorageProvider {
  /**
   * 存储文件
   * @param buffer 文件内容
   * @param filename 文件名（不含路径）
   * @param options 可选参数
   * @returns 存储路径或 URL
   */
  store(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions
  ): Promise<string>;

  /**
   * 获取文件
   * @param path 文件路径
   * @returns 文件内容
   */
  retrieve(path: string): Promise<Buffer>;

  /**
   * 获取文件访问 URL
   * @param path 文件路径
   * @returns 可访问的 URL
   */
  getUrl(path: string): Promise<string>;

  /**
   * 删除文件
   * @param path 文件路径
   */
  delete(path: string): Promise<void>;

  /**
   * 检查文件是否存在
   * @param path 文件路径
   */
  exists(path: string): Promise<boolean>;
}

/**
 * 存储选项
 */
export interface StorageOptions {
  /** 内容类型 */
  contentType?: string;
  /** 元数据 */
  metadata?: Record<string, string>;
  /** 子目录（如 'images', 'generated'） */
  subdir?: string;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  /** 存储类型 */
  type: 'local' | 'minio';
  /** 本地存储配置 */
  local?: {
    basePath: string;
  };
  /** MinIO 配置 */
  minio?: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    bucket: string;
    useSSL?: boolean;
    region?: string;
  };
}
