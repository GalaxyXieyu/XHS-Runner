#!/usr/bin/env tsx
/**
 * 数据库迁移脚本
 * 用途：在 Docker 容器启动后运行 Drizzle 迁移
 *
 * 使用方式：
 *   npm run db:migrate        # 运行所有待执行的迁移
 *   npm run db:push           # 开发环境：直接推送 schema 变更（不生成迁移文件）
 *   npm run db:generate       # 生成新的迁移文件
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!databaseUrl) {
    console.error('❌ 错误：未找到数据库连接字符串');
    console.error('请设置 DATABASE_URL 或 POSTGRES_URL 环境变量');
    process.exit(1);
  }

  console.log('🔄 开始数据库迁移...');
  console.log(`📍 数据库: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);

  // 创建迁移连接（max 1 连接）
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    // 运行迁移
    await migrate(db, { migrationsFolder: './drizzle' });

    console.log('✅ 数据库迁移完成');

    // 关闭连接
    await migrationClient.end();

    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    await migrationClient.end();
    process.exit(1);
  }
}

runMigrations();
