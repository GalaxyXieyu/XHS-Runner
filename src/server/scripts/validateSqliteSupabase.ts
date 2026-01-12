import { createClient } from '@supabase/supabase-js';
import { resolveUserDataPath } from '../runtime/userDataPath';

function loadBetterSqlite3() {
  try {
    return require('better-sqlite3');
  } catch (error: any) {
    const originalMessage = error?.message ? String(error.message) : String(error);
    throw new Error(`Unable to load better-sqlite3. Try: npm run rebuild\n\nOriginal error: ${originalMessage}`);
  }
}

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function tableExists(db: any, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name);
  return Boolean(row?.name);
}

async function getSupabaseCount(supabase: any, table: string) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

function getSqliteCount(db: any, table: string) {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get();
  return Number(row?.total || 0);
}

async function main() {
  const sqlitePath = getArgValue('--sqlite') || resolveUserDataPath('xhs-generator.db');
  const tablesRaw = getArgValue('--tables') || 'themes,keywords,topics,generation_tasks,publish_records,metrics,settings';
  const tables = tablesRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const BetterSqlite3 = loadBetterSqlite3();
  const db = new BetterSqlite3(sqlitePath, { readonly: true });

  console.log('[validate] sqlite:', sqlitePath);
  console.log('[validate] supabase:', supabaseUrl);
  console.log('[validate] tables:', tables);

  const rows: Array<{ table: string; sqlite: number; supabase: number; delta: number }> = [];
  for (const table of tables) {
    if (!tableExists(db, table)) {
      console.log(`[validate] skip ${table}: sqlite_table_missing`);
      continue;
    }
    const sqliteCount = getSqliteCount(db, table);
    const supabaseCount = await getSupabaseCount(supabase, table);
    rows.push({ table, sqlite: sqliteCount, supabase: supabaseCount, delta: supabaseCount - sqliteCount });
  }

  console.table(rows);
}

main().catch((error) => {
  console.error('[validate] failed:', error);
  process.exitCode = 1;
});

