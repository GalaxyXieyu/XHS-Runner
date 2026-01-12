import fs from 'fs';
import path from 'path';
import { resolveUserDataPath } from '../runtime/userDataPath';

const DB_FILENAME = 'xhs-generator.db';

let dbInstance: any | null = null;

function loadBetterSqlite3() {
  try {
    return require('better-sqlite3');
  } catch (error: any) {
    const originalMessage = error?.message ? String(error.message) : String(error);
    const versions = [
      `node=${process.versions?.node || 'unknown'}`,
      `electron=${process.versions?.electron || 'unknown'}`,
      `abi=${process.versions?.modules || 'unknown'}`,
    ].join(' ');
    const hint = [
      '无法加载 better-sqlite3 原生模块，通常是 Node/Electron ABI 不匹配导致。',
      `当前运行时版本：${versions}`,
      '',
      '修复方法：',
      '1) 在项目根目录执行：npm run rebuild',
      '2) 如果仍然失败：删除 node_modules 后重新 npm install',
      '',
      `原始错误：${originalMessage}`,
    ].join('\n');
    const wrapped = new Error(hint);
    (wrapped as any).cause = error;
    throw wrapped;
  }
}

export function getSqliteDatabasePath(): string {
  return resolveUserDataPath(DB_FILENAME);
}

function ensureDatabaseDirectory(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function migrate(db: any) {
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      analytics_json TEXT,
      config_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER,
      value TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(value)
    );
    CREATE INDEX IF NOT EXISTS idx_keywords_theme_id ON keywords(theme_id);

    CREATE TABLE IF NOT EXISTS competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER NOT NULL,
      xhs_user_id TEXT,
      name TEXT,
      last_monitored_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(theme_id) REFERENCES themes(id)
    );
    CREATE INDEX IF NOT EXISTS idx_competitors_theme_id ON competitors(theme_id);

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER,
      keyword_id INTEGER,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      note_id TEXT,
      xsec_token TEXT,
      url TEXT,
      desc TEXT,
      note_type TEXT,
      tags TEXT,
      cover_url TEXT,
      media_urls TEXT,
      author_id TEXT,
      author_name TEXT,
      author_avatar_url TEXT,
      like_count INTEGER,
      collect_count INTEGER,
      comment_count INTEGER,
      share_count INTEGER,
      published_at TEXT,
      fetched_at TEXT,
      raw_json TEXT,
      status TEXT NOT NULL DEFAULT 'captured',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(theme_id) REFERENCES themes(id),
      FOREIGN KEY(keyword_id) REFERENCES keywords(id)
    );
    CREATE INDEX IF NOT EXISTS idx_topics_theme_id ON topics(theme_id);
    CREATE INDEX IF NOT EXISTS idx_topics_keyword_id ON topics(keyword_id);
    CREATE INDEX IF NOT EXISTS idx_topics_note_id ON topics(note_id);
    CREATE INDEX IF NOT EXISTS idx_topics_source_source_id ON topics(source, source_id);

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS creatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER,
      source_topic_id INTEGER,
      source_topic_ids TEXT,
      title TEXT,
      content TEXT,
      script TEXT,
      tags TEXT,
      cover_style TEXT,
      cover_prompt TEXT,
      rationale_json TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      model TEXT,
      prompt TEXT,
      result_asset_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(theme_id) REFERENCES themes(id),
      FOREIGN KEY(source_topic_id) REFERENCES topics(id),
      FOREIGN KEY(result_asset_id) REFERENCES assets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_creatives_theme_id ON creatives(theme_id);

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER,
      topic_id INTEGER,
      creative_id INTEGER,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT,
      model TEXT,
      result_asset_id INTEGER,
      result_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(theme_id) REFERENCES themes(id),
      FOREIGN KEY(topic_id) REFERENCES topics(id),
      FOREIGN KEY(creative_id) REFERENCES creatives(id),
      FOREIGN KEY(result_asset_id) REFERENCES assets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_generation_tasks_topic_id ON generation_tasks(topic_id);
    CREATE INDEX IF NOT EXISTS idx_generation_tasks_theme_id ON generation_tasks(theme_id);
    CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);

    CREATE TABLE IF NOT EXISTS publish_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      theme_id INTEGER,
      creative_id INTEGER,
      note_id TEXT,
      xsec_token TEXT,
      type TEXT,
      title TEXT,
      content TEXT,
      tags TEXT,
      media_urls TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      scheduled_at TEXT,
      published_at TEXT,
      response_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_publish_records_theme_id ON publish_records(theme_id);
    CREATE INDEX IF NOT EXISTS idx_publish_records_status ON publish_records(status);

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER,
      metric_key TEXT NOT NULL,
      metric_value REAL NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(publish_record_id) REFERENCES publish_records(id)
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_publish_record_id ON metrics(publish_record_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_key_captured_at ON metrics(metric_key, captured_at);

    CREATE TABLE IF NOT EXISTS interaction_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(publish_record_id) REFERENCES publish_records(id)
    );
    CREATE INDEX IF NOT EXISTS idx_interaction_tasks_publish_record_id ON interaction_tasks(publish_record_id);
    CREATE INDEX IF NOT EXISTS idx_interaction_tasks_status ON interaction_tasks(status);

    CREATE TABLE IF NOT EXISTS form_assist_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER,
      suggestion_json TEXT,
      applied_json TEXT,
      feedback_json TEXT,
      status TEXT NOT NULL DEFAULT 'suggested',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(theme_id) REFERENCES themes(id)
    );
    CREATE INDEX IF NOT EXISTS idx_form_assist_records_theme_id ON form_assist_records(theme_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      job_type TEXT NOT NULL,
      theme_id INTEGER,
      keyword_id INTEGER,
      schedule_type TEXT NOT NULL,
      interval_minutes INTEGER,
      cron_expression TEXT,
      params_json TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 5,
      next_run_at TEXT,
      last_run_at TEXT,
      last_status TEXT,
      last_error TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(theme_id) REFERENCES themes(id),
      FOREIGN KEY(keyword_id) REFERENCES keywords(id)
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_theme_id ON scheduled_jobs(theme_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_keyword_id ON scheduled_jobs(keyword_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run_at ON scheduled_jobs(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(is_enabled);

    CREATE TABLE IF NOT EXISTS job_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      retry_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      result_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(job_id) REFERENCES scheduled_jobs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
    CREATE INDEX IF NOT EXISTS idx_job_executions_created_at ON job_executions(created_at);

    CREATE TABLE IF NOT EXISTS rate_limit_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      scope_id TEXT,
      request_count INTEGER NOT NULL DEFAULT 0,
      window_start TEXT NOT NULL DEFAULT (datetime('now')),
      last_request_at TEXT,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      blocked_until TEXT,
      block_reason TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_state_scope_scope_id ON rate_limit_state(scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_state_is_blocked ON rate_limit_state(is_blocked);
  `);
}

export function getSqliteDatabase(): any {
  if (dbInstance) return dbInstance;

  const BetterSqlite3 = loadBetterSqlite3();
  const dbPath = getSqliteDatabasePath();
  ensureDatabaseDirectory(dbPath);

  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');

  dbInstance = db;
  return dbInstance;
}

export function initializeSqliteDatabase() {
  const db = getSqliteDatabase();
  migrate(db);
}

