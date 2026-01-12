import { createClient } from '@supabase/supabase-js';
import { resolveUserDataPath } from '../runtime/userDataPath';

type TableConfig = {
  name: string;
  sqliteTable: string;
  primaryKey: string;
  columns: string[];
};

function loadBetterSqlite3() {
  try {
    return require('better-sqlite3');
  } catch (error: any) {
    const originalMessage = error?.message ? String(error.message) : String(error);
    throw new Error(`Unable to load better-sqlite3. Try: npm run rebuild\n\nOriginal error: ${originalMessage}`);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function tableExists(db: any, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name);
  return Boolean(row?.name);
}

function getTableColumns(db: any, name: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info('${name}')`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function pickColumns(row: Record<string, any>, columns: string[]) {
  const output: Record<string, any> = {};
  columns.forEach((key) => {
    if (row[key] !== undefined) {
      output[key] = row[key];
    }
  });
  return output;
}

const TABLES: TableConfig[] = [
  {
    name: 'themes',
    sqliteTable: 'themes',
    primaryKey: 'id',
    columns: ['id', 'name', 'description', 'status', 'analytics_json', 'config_json', 'created_at', 'updated_at'],
  },
  {
    name: 'keywords',
    sqliteTable: 'keywords',
    primaryKey: 'id',
    columns: [
      'id',
      'theme_id',
      'value',
      'keyword',
      'source',
      'priority',
      'status',
      'source_ref_id',
      'source_meta_json',
      'is_enabled',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'competitors',
    sqliteTable: 'competitors',
    primaryKey: 'id',
    columns: ['id', 'theme_id', 'xhs_user_id', 'name', 'last_monitored_at', 'created_at', 'updated_at'],
  },
  {
    name: 'topics',
    sqliteTable: 'topics',
    primaryKey: 'id',
    columns: [
      'id',
      'theme_id',
      'keyword_id',
      'title',
      'source',
      'source_id',
      'note_id',
      'xsec_token',
      'url',
      'desc',
      'note_type',
      'tags',
      'cover_url',
      'media_urls',
      'author_id',
      'author_name',
      'author_avatar_url',
      'like_count',
      'collect_count',
      'comment_count',
      'share_count',
      'published_at',
      'fetched_at',
      'raw_json',
      'status',
      'created_at',
    ],
  },
  {
    name: 'assets',
    sqliteTable: 'assets',
    primaryKey: 'id',
    columns: ['id', 'type', 'path', 'metadata', 'created_at'],
  },
  {
    name: 'creatives',
    sqliteTable: 'creatives',
    primaryKey: 'id',
    columns: [
      'id',
      'theme_id',
      'source_topic_id',
      'source_topic_ids',
      'title',
      'content',
      'script',
      'tags',
      'cover_style',
      'cover_prompt',
      'rationale_json',
      'status',
      'model',
      'prompt',
      'result_asset_id',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'generation_tasks',
    sqliteTable: 'generation_tasks',
    primaryKey: 'id',
    columns: [
      'id',
      'theme_id',
      'topic_id',
      'creative_id',
      'status',
      'prompt',
      'model',
      'result_asset_id',
      'result_json',
      'error_message',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'accounts',
    sqliteTable: 'accounts',
    primaryKey: 'id',
    columns: [
      'id',
      'platform',
      'xhs_user_id',
      'nickname',
      'avatar_url',
      'status',
      'auth_type',
      'auth_json',
      'created_at',
      'updated_at',
      'last_login_at',
    ],
  },
  {
    name: 'publish_records',
    sqliteTable: 'publish_records',
    primaryKey: 'id',
    columns: [
      'id',
      'account_id',
      'theme_id',
      'creative_id',
      'note_id',
      'xsec_token',
      'type',
      'title',
      'content',
      'tags',
      'media_urls',
      'status',
      'scheduled_at',
      'published_at',
      'response_json',
      'error_message',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'metrics',
    sqliteTable: 'metrics',
    primaryKey: 'id',
    columns: ['id', 'publish_record_id', 'metric_key', 'metric_value', 'captured_at'],
  },
  {
    name: 'interaction_tasks',
    sqliteTable: 'interaction_tasks',
    primaryKey: 'id',
    columns: ['id', 'publish_record_id', 'type', 'status', 'content', 'created_at', 'updated_at'],
  },
  {
    name: 'form_assist_records',
    sqliteTable: 'form_assist_records',
    primaryKey: 'id',
    columns: ['id', 'theme_id', 'suggestion_json', 'applied_json', 'feedback_json', 'status', 'created_at', 'updated_at'],
  },
  {
    name: 'settings',
    sqliteTable: 'settings',
    primaryKey: 'key',
    columns: ['key', 'value', 'updated_at'],
  },
  {
    name: 'llm_providers',
    sqliteTable: 'llm_providers',
    primaryKey: 'id',
    columns: [
      'id',
      'name',
      'provider_type',
      'base_url',
      'api_key',
      'model_name',
      'temperature',
      'max_tokens',
      'is_default',
      'is_enabled',
      'icon',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'prompt_profiles',
    sqliteTable: 'prompt_profiles',
    primaryKey: 'id',
    columns: [
      'id',
      'name',
      'category',
      'description',
      'system_prompt',
      'user_template',
      'model',
      'temperature',
      'max_tokens',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'trend_reports',
    sqliteTable: 'trend_reports',
    primaryKey: 'id',
    columns: ['id', 'theme_id', 'report_date', 'stats_json', 'analysis', 'created_at'],
  },
  {
    name: 'extension_services',
    sqliteTable: 'extension_services',
    primaryKey: 'id',
    columns: ['id', 'service_type', 'name', 'api_key', 'endpoint', 'config_json', 'is_enabled', 'created_at', 'updated_at'],
  },
  {
    name: 'scheduled_jobs',
    sqliteTable: 'scheduled_jobs',
    primaryKey: 'id',
    columns: [
      'id',
      'name',
      'job_type',
      'theme_id',
      'keyword_id',
      'schedule_type',
      'interval_minutes',
      'cron_expression',
      'params_json',
      'is_enabled',
      'priority',
      'next_run_at',
      'last_run_at',
      'last_status',
      'last_error',
      'run_count',
      'success_count',
      'fail_count',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'job_executions',
    sqliteTable: 'job_executions',
    primaryKey: 'id',
    columns: ['id', 'job_id', 'status', 'retry_count', 'started_at', 'finished_at', 'duration_ms', 'result_json', 'error_message', 'created_at'],
  },
  {
    name: 'rate_limit_state',
    sqliteTable: 'rate_limit_state',
    primaryKey: 'id',
    columns: [
      'id',
      'scope',
      'scope_id',
      'request_count',
      'window_start',
      'last_request_at',
      'is_blocked',
      'blocked_until',
      'block_reason',
    ],
  },
];

async function upsertTable({
  supabase,
  db,
  table,
  chunkSize,
  dryRun,
}: {
  supabase: any;
  db: any;
  table: TableConfig;
  chunkSize: number;
  dryRun: boolean;
}) {
  if (!tableExists(db, table.sqliteTable)) {
    return { table: table.name, skipped: true, reason: 'sqlite_table_missing' as const };
  }

  const existingColumns = getTableColumns(db, table.sqliteTable);
  const columns = table.columns.filter((col) => existingColumns.has(col));

  const rows = db.prepare(`SELECT * FROM ${table.sqliteTable}`).all() as Array<Record<string, any>>;
  if (rows.length === 0) {
    return { table: table.name, total: 0, inserted: 0, failed: 0 };
  }

  const payload = rows.map((row) => pickColumns(row, columns));

  if (dryRun) {
    return { table: table.name, total: rows.length, inserted: 0, failed: 0, dry_run: true };
  }

  let inserted = 0;
  let failed = 0;
  for (const batch of chunk(payload, chunkSize)) {
    const { error } = await supabase.from(table.name).upsert(batch, { onConflict: table.primaryKey });
    if (error) {
      failed += batch.length;
      console.error(`[migrate] ${table.name} upsert failed:`, error.message || error);
      continue;
    }
    inserted += batch.length;
  }

  return { table: table.name, total: rows.length, inserted, failed };
}

async function main() {
  const sqlitePath = getArgValue('--sqlite') || resolveUserDataPath('xhs-generator.db');
  const chunkSize = Number(getArgValue('--chunk') || '500');
  const dryRun = hasFlag('--dry-run');
  const onlyTablesRaw = getArgValue('--tables');
  const onlyTables = onlyTablesRaw
    ? new Set(
        onlyTablesRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      )
    : null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY.');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[migrate] Using non-service key; make sure RLS allows this migration or use SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const BetterSqlite3 = loadBetterSqlite3();
  const db = new BetterSqlite3(sqlitePath, { readonly: true });

  console.log('[migrate] sqlite:', sqlitePath);
  console.log('[migrate] supabase:', supabaseUrl);
  console.log('[migrate] dryRun:', dryRun, 'chunkSize:', chunkSize);

  const tables = onlyTables ? TABLES.filter((t) => onlyTables.has(t.name)) : TABLES;
  const results = [];
  for (const table of tables) {
    console.log(`[migrate] table=${table.name}...`);
    results.push(await upsertTable({ supabase, db, table, chunkSize, dryRun }));
  }

  const summary = results.reduce(
    (acc: any, row: any) => {
      if (row?.skipped) {
        acc.skipped += 1;
        return acc;
      }
      acc.tables += 1;
      acc.total += row.total || 0;
      acc.inserted += row.inserted || 0;
      acc.failed += row.failed || 0;
      return acc;
    },
    { tables: 0, skipped: 0, total: 0, inserted: 0, failed: 0 }
  );

  console.log('[migrate] summary:', summary);
}

main().catch((error) => {
  console.error('[migrate] failed:', error);
  process.exitCode = 1;
});

