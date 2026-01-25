#!/usr/bin/env node
/**
 * 数据库导入脚本
 *
 * 功能：
 * - 从 SQL dump 文件导入到本地/生产 PostgreSQL
 * - 支持验证导入结果
 *
 * 使用方法：
 *   # 本地导入
 *   npx tsx scripts/migrate-db/import-database.ts --file backups/supabase-export-xxx.sql
 *
 *   # 生产环境导入
 *   DATABASE_URL=... npx tsx scripts/migrate-db/import-database.ts --file backups/supabase-export-xxx.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import postgres from 'postgres';
import * as schema from '../../src/server/db/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = path.join(__dirname, '../backups');

// 获取数据库连接
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('DATABASE_URL 或 POSTGRES_URL 环境变量未设置');
  }
  return url;
}

// 解析连接信息
function parseConnectionString(url: string) {
  const match = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    throw new Error('无效的数据库连接字符串');
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };
}

// 获取所有表名
function getAllTableNames(): string[] {
  return Object.keys(schema).filter((key) => {
    const value = (schema as any)[key];
    return typeof value === 'object' && value !== null && 'drizzleName' in value;
  });
}

// 使用 psql 导入
async function importWithPsql(sqlFile: string): Promise<void> {
  const dbUrl = getDatabaseUrl();
  const connInfo = parseConnectionString(dbUrl);

  console.log('\n📥 使用 psql 导入数据...\n');

  const psqlCmd = [
    'psql',
    `--host=${connInfo.host}`,
    `--port=${connInfo.port}`,
    `--username=${connInfo.user}`,
    `--dbname=${connInfo.database}`,
    `--file=${sqlFile}`,
    '--set ON_ERROR_STOP=on',
  ].join(' ');

  try {
    execSync(psqlCmd, {
      env: {
        ...process.env,
        PGPASSWORD: connInfo.password,
      },
      stdio: 'inherit',
    });
    console.log('\n✅ 导入完成');
  } catch (error) {
    throw new Error(`导入失败: ${error}`);
  }
}

// 补齐必要约束（避免运行时报错）
async function ensureConstraints(): Promise<void> {
  const dbUrl = getDatabaseUrl();
  const sql = postgres(dbUrl);

  try {
    await sql.unsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS agent_prompts_agent_name_unique ON agent_prompts (agent_name)'
    );
  } finally {
    await sql.end();
  }
}

// 验证导入结果
async function validateImport(): Promise<void> {
  console.log('\n🔍 验证导入结果...\n');

  const dbUrl = getDatabaseUrl();
  const sql = postgres(dbUrl);

  try {
    const tableNames = getAllTableNames();

    const results: { table: string; rows: number; status: string }[] = [];

    for (const tableName of tableNames) {
      try {
        const result = await sql.unsafe(`SELECT COUNT(*) as count FROM "${tableName}"`);
        results.push({
          table: tableName,
          rows: Number(result[0]?.count || 0),
          status: 'success',
        });
      } catch (error) {
        results.push({
          table: tableName,
          rows: 0,
          status: 'error',
        });
      }
    }

    // 打印结果
    console.log('┌─────────────────────────────┬────────┬──────────┐');
    console.log('│ Table                      │ Rows   │ Status   │');
    console.log('├─────────────────────────────┼────────┼──────────┤');
    for (const item of results) {
      const rowsStr = String(item.rows).padEnd(6);
      const statusStr = item.status === 'success' ? '✅ OK' : '❌ ERR';
      const tableStr = (item.table.padEnd(27)).slice(0, 27);
      console.log(`│ ${tableStr} │ ${rowsStr} │ ${statusStr.padEnd(8)} │`);
    }
    console.log('└─────────────────────────────┴────────┴──────────┘');

    const totalRows = results.reduce((sum, t) => sum + t.rows, 0);
    const errorCount = results.filter((r) => r.status === 'error').length;

    console.log(`\n总计: ${results.length} 个表, ${totalRows} 行数据`);
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} 个表出现错误`);
    }

    await sql.end();

    if (errorCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 验证失败:', error);
    process.exit(1);
  }
}

// 主函数
async function main() {
  console.log('==========================================');
  console.log('数据库导入工具');
  console.log('==========================================');

  // 解析参数
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  const sqlFile = fileArg ? fileArg.replace('--file=', '') : null;

  if (!sqlFile) {
    console.log('\n使用方法:');
    console.log('  npx tsx scripts/migrate-db/import-database.ts --file=<sql-file>');
    console.log('\n示例:');
    console.log('  npx tsx scripts/migrate-db/import-database.ts --file backups/supabase-export-2024-01-15.sql');
    console.log('\n可用的备份文件:');
    listBackups();
    process.exit(1);
  }

  // 检查文件存在
  if (!fs.existsSync(sqlFile)) {
    console.error(`\n❌ 文件不存在: ${sqlFile}`);
    listBackups();
    process.exit(1);
  }

  // 显示连接信息
  const dbUrl = getDatabaseUrl();
  const connInfo = parseConnectionString(dbUrl);
  console.log('\n连接信息:');
  console.log(`  主机: ${connInfo.host}:${connInfo.port}`);
  console.log(`  数据库: ${connInfo.database}`);
  console.log(`  用户: ${connInfo.user}`);
  console.log(`  文件: ${path.basename(sqlFile)}`);

  // 确认导入
  const readLine = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      process.stdout.write(prompt);
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });
  };

  if (!process.env.CI) {
    const confirm = await readLine('\n⚠️  这将覆盖目标数据库中的所有数据！确认继续? (yes/NO): ');
    if (confirm !== 'yes') {
      console.log('已取消');
      process.exit(0);
    }
  }

  try {
    // 导入
    await importWithPsql(sqlFile);

    // 补齐必要约束
    await ensureConstraints();

    // 验证
    await validateImport();

    console.log('\n✅ 导入成功完成！');
  } catch (error) {
    console.error('\n❌ 导入失败:', error);
    process.exit(1);
  }
}

// 列出可用备份
function listBackups(): void {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return;
  }

  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return;
  }

  console.log('\n可用的备份文件:');
  for (const file of files) {
    const fullPath = path.join(BACKUPS_DIR, file);
    const stats = fs.statSync(fullPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const mtime = stats.mtime.toLocaleString('zh-CN');
    console.log(`  - ${file} (${sizeMB} MB, ${mtime})`);
  }
}

// 如果作为模块导入，不执行 main
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
