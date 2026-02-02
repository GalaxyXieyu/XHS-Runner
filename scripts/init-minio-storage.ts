#!/usr/bin/env tsx

/**
 * MinIO 初始化和资源迁移脚本
 *
 * 功能：
 * 1. 创建 xhs-assets bucket
 * 2. 设置公开读取策略
 * 3. 可选：迁移本地文件到 MinIO
 *
 * 使用方法：
 * npx tsx scripts/init-minio-storage.ts [--migrate]
 */

import * as Minio from 'minio';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../src/server/db';
import { assets } from '../src/server/db/schema';

const MINIO_CONFIG = {
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '23030'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
};

const BUCKET_NAME = process.env.MINIO_BUCKET || 'xhs-assets';

async function initMinIO() {
  console.log('🚀 Initializing MinIO...');
  console.log(`   Endpoint: ${MINIO_CONFIG.endPoint}:${MINIO_CONFIG.port}`);
  console.log(`   Bucket: ${BUCKET_NAME}`);

  const client = new Minio.Client(MINIO_CONFIG);

  // 检查 bucket 是否存在
  const exists = await client.bucketExists(BUCKET_NAME);

  if (exists) {
    console.log(`✅ Bucket "${BUCKET_NAME}" already exists`);
  } else {
    console.log(`📦 Creating bucket "${BUCKET_NAME}"...`);
    await client.makeBucket(BUCKET_NAME, 'us-east-1');
    console.log(`✅ Bucket created successfully`);
  }

  // 设置公开读取策略
  console.log('🔓 Setting public read policy...');
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
      },
    ],
  };

  await client.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
  console.log('✅ Policy set successfully');

  return client;
}

async function migrateAssets(client: Minio.Client, assetsDir: string) {
  console.log('\n📦 Migrating local assets to MinIO...');
  console.log(`   Source: ${assetsDir}`);

  // 获取所有资源记录
  const allAssets = await db.select().from(assets);
  console.log(`   Found ${allAssets.length} assets in database`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const asset of allAssets) {
    try {
      const localPath = asset.path;
      const filename = path.basename(localPath);

      // 检查本地文件是否存在
      try {
        await fs.access(localPath);
      } catch {
        console.log(`   ⚠️  File not found: ${localPath}`);
        skipped++;
        continue;
      }

      // 检查 MinIO 中是否已存在
      try {
        await client.statObject(BUCKET_NAME, filename);
        console.log(`   ⏭️  Already exists: ${filename}`);
        skipped++;
        continue;
      } catch {
        // 文件不存在，继续上传
      }

      // 读取文件并上传
      const fileBuffer = await fs.readFile(localPath);
      await client.putObject(BUCKET_NAME, filename, fileBuffer, fileBuffer.length, {
        'Content-Type': 'image/png',
      });

      console.log(`   ✅ Migrated: ${filename} (${Math.round(fileBuffer.length / 1024)}KB)`);
      migrated++;
    } catch (error) {
      console.error(`   ❌ Failed to migrate ${asset.path}:`, error);
      failed++;
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
}

async function main() {
  const shouldMigrate = process.argv.includes('--migrate');

  try {
    // 初始化 MinIO
    const client = await initMinIO();

    // 迁移资源（如果指定）
    if (shouldMigrate) {
      const assetsDir = process.env.XHS_USER_DATA_PATH
        ? path.join(process.env.XHS_USER_DATA_PATH, 'assets')
        : path.join(process.cwd(), 'assets');

      await migrateAssets(client, assetsDir);
    } else {
      console.log('\n💡 Tip: Run with --migrate flag to migrate existing assets');
    }

    console.log('\n✨ Done!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();

