#!/usr/bin/env node
/**
 * Supabase 数据库导出脚本
 *
 * 功能：
 * - 从 Supabase 导出所有表结构和数据
 * - 生成 SQL dump 文件
 * - 导出 JSON 备份用于参考
 *
 * 使用方法：
 *   npx tsx scripts/migrate-db/export-from-supabase.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '../backups');

// Supabase 连接配置 - 优先使用 SUPABASE_DB_URL，支持命令行覆盖
function resolveSupabaseUrl(args: string[]): string {
  const argUrl = args.find((arg) => arg.startsWith('--url='));
  if (argUrl) return argUrl.replace('--url=', '');

  const envUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!envUrl) {
    throw new Error('请设置 SUPABASE_DB_URL（推荐）或 DATABASE_URL，或使用 --url= 指定连接');
  }
  return envUrl;
}

// 导出配置
const EXPORT_CONFIG = {
  excludeTables: [], // 不导出的表
  includeSchema: true,
  includeData: true,
  format: 'sql', // sql | json
};

type ColumnInfo = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  udt_name: string | null;
  element_type: string | null;
};

const UDT_TYPE_MAP: Record<string, string> = {
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  float4: 'real',
  float8: 'double precision',
  numeric: 'numeric',
  bool: 'boolean',
  bpchar: 'character',
  varchar: 'character varying',
  text: 'text',
  uuid: 'uuid',
  json: 'json',
  jsonb: 'jsonb',
  date: 'date',
  timestamp: 'timestamp without time zone',
  timestamptz: 'timestamp with time zone',
};

function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

function isBytea(value: unknown): value is Buffer | Uint8Array {
  return value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value));
}

function formatSequenceName(name: string): string {
  if (name.includes('.')) {
    return name.split('.').map((part) => `"${part}"`).join('.');
  }
  return `"${name}"`;
}

function formatSequenceLiteral(name: string): string {
  return name.includes('.') ? name : name;
}

function resolveArrayBaseType(col: ColumnInfo): string {
  if (col.element_type) {
    return col.element_type;
  }
  if (col.udt_name && col.udt_name.startsWith('_')) {
    const base = col.udt_name.slice(1);
    return UDT_TYPE_MAP[base] || base;
  }
  return 'text';
}

function resolveColumnType(col: ColumnInfo): string {
  if (col.data_type === 'ARRAY') {
    return `${resolveArrayBaseType(col)}[]`;
  }
  if (col.data_type === 'USER-DEFINED' && col.udt_name) {
    return col.udt_name;
  }
  return col.data_type;
}

function extractSequenceName(defaultValue: string | null): string | null {
  if (!defaultValue) return null;
  const match = defaultValue.match(/nextval\\('([^']+)'::regclass\\)/);
  return match ? match[1] : null;
}

function formatArrayValue(values: unknown[], columnType: string): string {
  const arrayType = columnType && columnType.endsWith('[]') ? columnType : '';
  const elementType = arrayType ? arrayType.slice(0, -2) : '';

  if (values.length === 0) {
    return arrayType ? `ARRAY[]::${arrayType}` : 'ARRAY[]';
  }

  const formatted = values.map((value) => formatArrayElement(value, elementType));
  const arrayLiteral = `ARRAY[${formatted.join(', ')}]`;
  return arrayType ? `${arrayLiteral}::${arrayType}` : arrayLiteral;
}

function formatArrayElement(value: unknown, elementType: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (isBytea(value)) {
    return `'\\\\x${Buffer.from(value).toString('hex')}'::bytea`;
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === 'string') return `'${escapeString(value)}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (elementType === 'jsonb' || elementType === 'json') {
      return `'${escapeString(json)}'::${elementType}`;
    }
    return `'${escapeString(json)}'`;
  }

  return `'${escapeString(String(value))}'`;
}

function formatValue(value: unknown, columnType: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (isBytea(value)) {
    return `'\\\\x${Buffer.from(value).toString('hex')}'::bytea`;
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (Array.isArray(value)) {
    return formatArrayValue(value, columnType);
  }
  if (typeof value === 'string') return `'${escapeString(value)}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (columnType === 'json' || columnType === 'jsonb') {
      return `'${escapeString(json)}'::${columnType}`;
    }
    return `'${escapeString(json)}'`;
  }

  return `'${escapeString(String(value))}'`;
}

// 获取所有表名 - 直接从数据库查询
async function getAllTableNames(sql: ReturnType<typeof postgres>): Promise<string[]> {
  // 从数据库获取所有用户表
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return tables.map((t: any) => t.table_name);
}

// 导出表结构和数据
interface ExportResult {
  schema: string;
  data: string;
  foreignKeys: string;
  sequenceReset: string;
  rowCount: number;
}

async function exportTable(sql: ReturnType<typeof postgres>, tableName: string): Promise<ExportResult> {
  console.log(`\n导出表: ${tableName}`);

  try {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
      throw new Error(`非法表名: ${tableName}`);
    }

    // 获取表结构
    const schemaResult = await sql`
      SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.udt_name,
        et.data_type AS element_type
      FROM information_schema.columns c
      LEFT JOIN information_schema.element_types et
        ON c.table_catalog = et.object_catalog
        AND c.table_schema = et.object_schema
        AND c.table_name = et.object_name
        AND c.dtd_identifier = et.collection_type_identifier
      WHERE c.table_schema = 'public'
        AND c.table_name = ${tableName}
      ORDER BY c.ordinal_position
    `;

    if (schemaResult.length === 0) {
      console.log(`  ⚠️  表 ${tableName} 不存在或无结构`);
      return {
        schema: `-- Table: ${tableName} (no structure found)\n`,
        data: '',
        foreignKeys: '',
        sequenceReset: '',
        rowCount: 0,
      };
    }

    // 生成 CREATE TABLE 语句
    let createSQL = `-- ============================================\n`;
    createSQL += `-- Table: ${tableName}\n`;
    createSQL += `-- ============================================\n\n`;
    createSQL += `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n\n`;

    const schemaColumns = schemaResult as unknown as ColumnInfo[];
    const sequences = new Set<string>();
    for (const col of schemaColumns) {
      const sequenceName = extractSequenceName(col.column_default);
      if (sequenceName) sequences.add(sequenceName);
    }

    for (const sequenceName of sequences) {
      createSQL += `CREATE SEQUENCE IF NOT EXISTS ${formatSequenceName(sequenceName)};\n`;
    }

    if (sequences.size > 0) {
      createSQL += '\n';
    }

    // 获取主键
    const pkResult = await sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = ${tableName}
        AND tc.constraint_type = 'PRIMARY KEY'
    `;

    const pkColumns = pkResult.map((r: any) => r.column_name);

    createSQL += `CREATE TABLE "${tableName}" (\n`;
    const columnDefs: string[] = [];
    const columnTypeMap = new Map<string, string>();
    for (const col of schemaColumns) {
      const columnType = resolveColumnType(col);
      columnTypeMap.set(col.column_name, columnType);

      let colDef = `  "${col.column_name}" ${columnType}`;
      if (col.is_nullable === 'NO') colDef += ' NOT NULL';
      if (col.column_default) colDef += ` DEFAULT ${col.column_default}`;
      columnDefs.push(colDef);
    }

    // 添加主键
    if (pkColumns.length > 0) {
      columnDefs.push(`  PRIMARY KEY (${pkColumns.map((c) => `"${c}"`).join(', ')})`);
    }

    createSQL += columnDefs.join(',\n');
    createSQL += '\n);\n\n';

    const ownershipSQL: string[] = [];
    for (const col of schemaColumns) {
      const sequenceName = extractSequenceName(col.column_default);
      if (sequenceName) {
        ownershipSQL.push(
          `ALTER SEQUENCE ${formatSequenceName(sequenceName)} OWNED BY "${tableName}"."${col.column_name}";`
        );
      }
    }
    if (ownershipSQL.length > 0) {
      createSQL += `${ownershipSQL.join('\n')}\n\n`;
    }

    // 获取外键约束
    const fkResult = await sql`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = ${tableName}
        AND tc.constraint_type = 'FOREIGN KEY'
    `;

    const foreignKeys: string[] = [];
    for (const fk of fkResult) {
      foreignKeys.push(
        `ALTER TABLE "${tableName}" ADD CONSTRAINT "${fk.constraint_name}" ` +
          `FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table_name}" ("${fk.foreign_column_name}") ` +
          `ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule};`
      );
    }

    // 导出数据 - 使用 unsafe 来处理动态表名
    const dataResult = await sql.unsafe(`SELECT * FROM "${tableName}"`);
    const insertSQLs: string[] = [];
    const sequenceResetSQLs: string[] = [];

    if (dataResult.length > 0) {
      const columns = Object.keys(dataResult[0]);
      insertSQLs.push(`-- ${dataResult.length} rows in ${tableName}`);
      insertSQLs.push('');

      const sequenceColumns = columns.filter((col) => {
        const columnInfo = schemaColumns.find((c) => c.column_name === col);
        return Boolean(columnInfo && extractSequenceName(columnInfo.column_default));
      });

      for (const col of sequenceColumns) {
        const columnInfo = schemaColumns.find((c) => c.column_name === col);
        const sequenceName = columnInfo ? extractSequenceName(columnInfo.column_default) : null;
        if (!sequenceName) continue;

        const maxValue = dataResult.reduce((max, row) => {
          const value = row[col];
          if (value === null || value === undefined) return max;
          const num = typeof value === 'bigint' ? Number(value) : Number(value);
          if (!Number.isFinite(num)) return max;
          return Math.max(max, num);
        }, 0);

        if (maxValue > 0) {
          sequenceResetSQLs.push(
            `SELECT setval('${formatSequenceLiteral(sequenceName)}', ${maxValue}, true);`
          );
        }
      }

      for (const row of dataResult) {
        const values = columns.map((col) => {
          const val = row[col];
          const columnType = columnTypeMap.get(col) || '';
          return formatValue(val, columnType);
        });
        insertSQLs.push(`INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`);
      }
      insertSQLs.push('');

      console.log(`  ✅ 导出 ${dataResult.length} 行数据`);
    } else {
      insertSQLs.push(`-- No data in ${tableName}`);
      insertSQLs.push('');
      console.log(`  ℹ️  表为空`);
    }

    return {
      schema: createSQL,
      data: insertSQLs.join('\n'),
      foreignKeys: foreignKeys.length > 0 ? `${foreignKeys.join('\n')}\n` : '',
      sequenceReset: sequenceResetSQLs.length > 0 ? `${sequenceResetSQLs.join('\n')}\n` : '',
      rowCount: dataResult.length,
    };
  } catch (error) {
    const err = error as Error;
    console.error(`  ❌ 导出表 ${tableName} 失败: ${err.message}`);
    if (err.stack) {
      console.error(`  Stack: ${err.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    return {
      schema: `-- Table: ${tableName} (export failed: ${err.message})\n`,
      data: '',
      foreignKeys: '',
      sequenceReset: '',
      rowCount: 0,
    };
  }
}

// 主导出函数
async function main() {
  console.log('🚀 开始从 Supabase 导出数据库...\n');
  const args = process.argv.slice(2);
  const supabaseUrl = resolveSupabaseUrl(args);
  const usingFallback = !args.some((arg) => arg.startsWith('--url=')) && !process.env.SUPABASE_DB_URL;
  if (usingFallback) {
    console.log('⚠️  未设置 SUPABASE_DB_URL，当前使用 DATABASE_URL 作为导出连接\n');
  }
  console.log(`连接: ${supabaseUrl.replace(/:[^:]+@/, ':****@')}\n`);

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const sql = postgres(supabaseUrl);

  try {
    // 获取所有表名
    const tableNames = await getAllTableNames(sql);
    console.log(`📋 发现 ${tableNames.length} 个表:`, tableNames.join(', '));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // 导出所有表
    const allSchemaSQL: string[] = [];
    const allDataSQL: string[] = [];
    const allForeignKeySQL: string[] = [];
    const allSequenceResetSQL: string[] = [];
    const summary: { table: string; rows: number; status: string }[] = [];

    for (const tableName of tableNames) {
      const result = await exportTable(sql, tableName);
      allSchemaSQL.push(result.schema);
      allDataSQL.push(result.data);
      allForeignKeySQL.push(result.foreignKeys);
      allSequenceResetSQL.push(result.sequenceReset);
      summary.push({
        table: tableName,
        rows: result.rowCount,
        status: result.rowCount >= 0 ? 'success' : 'error',
      });
    }

    // 写入完整 SQL 文件
    let fullSQL = `-- ============================================
-- XHS Generator Database Export
-- Source: Supabase
-- Generated: ${new Date().toISOString()}
-- ============================================

-- Disable triggers and constraints during import (ignore if not superuser)
DO $$
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'insufficient privilege to set session_replication_role';
END
$$;

`;

    if (EXPORT_CONFIG.includeSchema) {
      fullSQL += '\n-- ============================================\n';
      fullSQL += '-- SCHEMA\n';
      fullSQL += '-- ============================================\n\n';
      fullSQL += allSchemaSQL.join('\n');
    }

    if (EXPORT_CONFIG.includeSchema && allForeignKeySQL.some((sqlChunk) => sqlChunk.trim().length > 0)) {
      fullSQL += '\n-- ============================================\n';
      fullSQL += '-- FOREIGN KEYS\n';
      fullSQL += '-- ============================================\n\n';
      fullSQL += allForeignKeySQL.join('\n');
    }

    if (EXPORT_CONFIG.includeData) {
      fullSQL += '\n-- ============================================\n';
      fullSQL += '-- DATA\n';
      fullSQL += '-- ============================================\n\n';
      fullSQL += allDataSQL.join('\n');
    }

    if (EXPORT_CONFIG.includeData && allSequenceResetSQL.some((sqlChunk) => sqlChunk.trim().length > 0)) {
      fullSQL += '\n-- ============================================\n';
      fullSQL += '-- SEQUENCE RESETS\n';
      fullSQL += '-- ============================================\n\n';
      fullSQL += allSequenceResetSQL.join('\n');
    }

    fullSQL += '\n-- Re-enable triggers\n';
    fullSQL += `DO $$\nBEGIN\n  PERFORM set_config('session_replication_role', 'origin', true);\nEXCEPTION WHEN insufficient_privilege THEN\n  RAISE NOTICE 'insufficient privilege to set session_replication_role';\nEND\n$$;\n`;

    const sqlFile = path.join(OUTPUT_DIR, `supabase-export-${timestamp}.sql`);
    fs.writeFileSync(sqlFile, fullSQL);
    console.log(`\n✅ SQL 文件已生成: ${sqlFile}`);

    // 写入摘要 JSON
    const summaryFile = path.join(OUTPUT_DIR, `supabase-export-${timestamp}-summary.json`);
    fs.writeFileSync(summaryFile, JSON.stringify({
      timestamp,
      source: 'Supabase',
      tables: summary,
      totalTables: summary.length,
      totalRows: summary.reduce((sum, t) => sum + t.rows, 0),
    }, null, 2));
    console.log(`📊 摘要文件已生成: ${summaryFile}`);

    // 打印摘要
    console.log('\n📋 导出摘要:');
    console.log('┌─────────────────────────────┬────────┬──────────┐');
    console.log('│ Table                      │ Rows   │ Status   │');
    console.log('├─────────────────────────────┼────────┼──────────┤');
    for (const item of summary) {
      const rowsStr = String(item.rows).padEnd(6);
      const statusStr = item.status === 'success' ? '✅ OK' : '❌ ERR';
      const tableStr = (item.table.padEnd(27)).slice(0, 27);
      console.log(`│ ${tableStr} │ ${rowsStr} │ ${statusStr.padEnd(8)} │`);
    }
    console.log('└─────────────────────────────┴────────┴──────────┘');
    const total = summary.reduce((sum, t) => sum + t.rows, 0);
    console.log(`Total: ${summary.length} tables, ${total} rows`);

  } catch (error) {
    console.error('\n❌ 导出失败:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
