import * as Minio from 'minio';
import { StorageProvider, StorageOptions } from './types';

/**
 * MinIO 对象存储提供者
 */
export class MinIOStorageProvider implements StorageProvider {
  private client: Minio.Client;
  private bucket: string;

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
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
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
    }
  }

  async store(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions
  ): Promise<string> {
    // 构建对象路径
    const subdir = options?.subdir || '';
    const objectName = subdir ? `${subdir}/${filename}` : filename;

    // 上传到 MinIO
    await this.client.putObject(
      this.bucket,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': options?.contentType || 'application/octet-stream',
        ...options?.metadata,
      }
    );

    return objectName;
  }

  async retrieve(path: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, path);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getUrl(path: string): Promise<string> {
    // 生成预签名 URL（24小时有效）
    return await this.client.presignedGetObject(
      this.bucket,
      path,
      24 * 60 * 60
    );
  }

  async delete(path: string): Promise<void> {
    await this.client.removeObject(this.bucket, path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, path);
      return true;
    } catch {
      return false;
    }
  }
}
