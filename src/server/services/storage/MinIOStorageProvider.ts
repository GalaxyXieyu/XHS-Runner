import * as Minio from 'minio';
import { StorageProvider, StorageOptions } from './types';

/**
 * MinIO 对象存储提供者
 */
export class MinIOStorageProvider implements StorageProvider {
  private client: Minio.Client;
  private bucket: string;
  private initPromise: Promise<void> | null = null;
  private initialized = false;

  constructor(config: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    bucket: string;
    useSSL?: boolean;
    region?: string;
  }) {
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL ?? false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region,
    });
    this.bucket = config.bucket;
  }

  /**
   * 初始化（确保 bucket 存在）
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.doInitialize();
    }

    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      console.log(`[MinIO] Creating bucket: ${this.bucket}`);
      await this.client.makeBucket(this.bucket, 'us-east-1');
      // 设置公开读取策略
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      };
      await this.client.setBucketPolicy(
        this.bucket,
        JSON.stringify(policy)
      );
      console.log(`[MinIO] Bucket created and policy set: ${this.bucket}`);
    } else {
      console.log(`[MinIO] Bucket already exists: ${this.bucket}`);
    }
    this.initialized = true;
  }

  async store(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions
  ): Promise<string> {
    // 确保已初始化
    await this.initialize();

    // 构建对象路径
    const subdir = options?.subdir || '';
    const objectName = subdir ? `${subdir}/${filename}` : filename;

    // 注意：metadata 不存到 MinIO header，已由 StorageService 存到数据库
    // MinIO/S3 header 有 2KB 限制，且只支持 ASCII 字符，不适合存 prompt 等长文本
    if (options?.metadata) {
      console.log(`[MinIO] 跳过 metadata (${Object.keys(options.metadata).length} 个字段), 已存数据库`);
    }

    // 上传到 MinIO（只存文件，不存 metadata）
    await this.client.putObject(
      this.bucket,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': options?.contentType || 'application/octet-stream',
      }
    );

    console.log(`[MinIO] Uploaded: ${objectName} (${Math.round(buffer.length / 1024)}KB)`);
    return objectName;
  }

  async retrieve(path: string): Promise<Buffer> {
    await this.initialize();
    const stream = await this.client.getObject(this.bucket, path);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getUrl(path: string): Promise<string> {
    await this.initialize();
    // 生成预签名 URL（24小时有效）
    return await this.client.presignedGetObject(
      this.bucket,
      path,
      24 * 60 * 60
    );
  }

  async delete(path: string): Promise<void> {
    await this.initialize();
    await this.client.removeObject(this.bucket, path);
  }

  async exists(path: string): Promise<boolean> {
    await this.initialize();
    try {
      await this.client.statObject(this.bucket, path);
      return true;
    } catch {
      return false;
    }
  }
}
