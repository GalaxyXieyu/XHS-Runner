import fs from 'fs';
import path from 'path';
import { resolveUserDataPath } from './runtime/userDataPath';

const Database = require('better-sqlite3');

const DB_FILENAME = 'xhs-generator.db';
const SCHEMA_VERSION = 9;

let dbInstance: any;

export function getDatabasePath() {
  return resolveUserDataPath(DB_FILENAME);
}

function ensureDatabaseDirectory(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function migrate(db: any) {
  const currentVersion = db.pragma('user_version', { simple: true });
  if (currentVersion < 1) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL UNIQUE,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id INTEGER,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(keyword_id) REFERENCES keywords(id)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      status TEXT NOT NULL,
      prompt TEXT,
      result_asset_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(topic_id) REFERENCES topics(id),
      FOREIGN KEY(result_asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS publish_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      published_at TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(task_id) REFERENCES generation_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER,
      metric_key TEXT NOT NULL,
      metric_value REAL NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(publish_record_id) REFERENCES publish_records(id)
    );

    CREATE INDEX IF NOT EXISTS idx_topics_keyword_id ON topics(keyword_id);
    CREATE INDEX IF NOT EXISTS idx_generation_tasks_topic_id ON generation_tasks(topic_id);
    CREATE INDEX IF NOT EXISTS idx_publish_records_task_id ON publish_records(task_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_publish_record_id ON metrics(publish_record_id);
  `);
  }

  if (currentVersion < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  if (currentVersion < 3) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_topics_source_source_id ON topics(source, source_id);
    `);
  }

  if (currentVersion < 4) {
    const columns = db.prepare("PRAGMA table_info('topics')").all().map((col: any) => col.name);
    if (!columns.includes('status')) {
      db.exec("ALTER TABLE topics ADD COLUMN status TEXT NOT NULL DEFAULT 'captured'");
    }
  }

  if (currentVersion < 5) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        analytics_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS competitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        theme_id INTEGER NOT NULL,
        xhs_user_id TEXT NOT NULL,
        name TEXT,
        last_monitored_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(theme_id) REFERENCES themes(id)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        sentiment TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(topic_id) REFERENCES topics(id)
      );

      CREATE TABLE IF NOT EXISTS creatives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        theme_id INTEGER,
        prompt TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        result_asset_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(theme_id) REFERENCES themes(id),
        FOREIGN KEY(result_asset_id) REFERENCES assets(id)
      );

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

      CREATE INDEX IF NOT EXISTS idx_competitors_theme_id ON competitors(theme_id);
      CREATE INDEX IF NOT EXISTS idx_comments_topic_id ON comments(topic_id);
      CREATE INDEX IF NOT EXISTS idx_creatives_theme_id ON creatives(theme_id);
      CREATE INDEX IF NOT EXISTS idx_interaction_tasks_publish_record_id
        ON interaction_tasks(publish_record_id);
    `);

    const keywordColumns = db.prepare("PRAGMA table_info('keywords')").all().map((col: any) => col.name);
    if (!keywordColumns.includes('theme_id')) {
      db.exec('ALTER TABLE keywords ADD COLUMN theme_id INTEGER');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_keywords_theme_id ON keywords(theme_id)');
  }

  if (currentVersion < 6) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS topic_growth_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        view_count INTEGER,
        like_count INTEGER,
        collect_count INTEGER,
        comment_count INTEGER,
        share_count INTEGER,
        updated_at TEXT,
        FOREIGN KEY(topic_id) REFERENCES topics(id)
      );

      CREATE TABLE IF NOT EXISTS creative_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creative_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        url TEXT,
        file_path TEXT,
        meta_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(creative_id) REFERENCES creatives(id)
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        xhs_user_id TEXT,
        nickname TEXT,
        avatar_url TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        auth_type TEXT,
        auth_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        last_login_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_topic_growth_data_topic_id ON topic_growth_data(topic_id);
      CREATE INDEX IF NOT EXISTS idx_creative_assets_creative_id ON creative_assets(creative_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
    `);

    const keywordColumns = db.prepare("PRAGMA table_info('keywords')").all().map((col: any) => col.name);
    if (!keywordColumns.includes('keyword')) {
      db.exec('ALTER TABLE keywords ADD COLUMN keyword TEXT');
      db.exec('UPDATE keywords SET keyword = value WHERE keyword IS NULL');
    }
    if (!keywordColumns.includes('source')) {
      db.exec("ALTER TABLE keywords ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
    }
    if (!keywordColumns.includes('priority')) {
      db.exec('ALTER TABLE keywords ADD COLUMN priority INTEGER');
    }
    if (!keywordColumns.includes('status')) {
      db.exec("ALTER TABLE keywords ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
      db.exec(
        "UPDATE keywords SET status = CASE WHEN is_enabled = 1 THEN 'active' ELSE 'archived' END WHERE status IS NULL"
      );
    }
    if (!keywordColumns.includes('source_ref_id')) {
      db.exec('ALTER TABLE keywords ADD COLUMN source_ref_id TEXT');
    }
    if (!keywordColumns.includes('source_meta_json')) {
      db.exec('ALTER TABLE keywords ADD COLUMN source_meta_json TEXT');
    }

    const topicColumns = db.prepare("PRAGMA table_info('topics')").all().map((col: any) => col.name);
    if (!topicColumns.includes('theme_id')) {
      db.exec('ALTER TABLE topics ADD COLUMN theme_id INTEGER');
      db.exec(
        'UPDATE topics SET theme_id = (SELECT theme_id FROM keywords WHERE keywords.id = topics.keyword_id) WHERE theme_id IS NULL'
      );
    }
    if (!topicColumns.includes('note_id')) {
      db.exec('ALTER TABLE topics ADD COLUMN note_id TEXT');
      db.exec('UPDATE topics SET note_id = source_id WHERE note_id IS NULL');
    }
    if (!topicColumns.includes('xsec_token')) {
      db.exec('ALTER TABLE topics ADD COLUMN xsec_token TEXT');
    }
    if (!topicColumns.includes('desc')) {
      db.exec('ALTER TABLE topics ADD COLUMN desc TEXT');
    }
    if (!topicColumns.includes('note_type')) {
      db.exec('ALTER TABLE topics ADD COLUMN note_type TEXT');
    }
    if (!topicColumns.includes('tags')) {
      db.exec('ALTER TABLE topics ADD COLUMN tags TEXT');
    }
    if (!topicColumns.includes('cover_url')) {
      db.exec('ALTER TABLE topics ADD COLUMN cover_url TEXT');
    }
    if (!topicColumns.includes('media_urls')) {
      db.exec('ALTER TABLE topics ADD COLUMN media_urls TEXT');
    }
    if (!topicColumns.includes('author_id')) {
      db.exec('ALTER TABLE topics ADD COLUMN author_id TEXT');
    }
    if (!topicColumns.includes('author_name')) {
      db.exec('ALTER TABLE topics ADD COLUMN author_name TEXT');
    }
    if (!topicColumns.includes('author_avatar_url')) {
      db.exec('ALTER TABLE topics ADD COLUMN author_avatar_url TEXT');
    }
    if (!topicColumns.includes('like_count')) {
      db.exec('ALTER TABLE topics ADD COLUMN like_count INTEGER');
    }
    if (!topicColumns.includes('collect_count')) {
      db.exec('ALTER TABLE topics ADD COLUMN collect_count INTEGER');
    }
    if (!topicColumns.includes('comment_count')) {
      db.exec('ALTER TABLE topics ADD COLUMN comment_count INTEGER');
    }
    if (!topicColumns.includes('share_count')) {
      db.exec('ALTER TABLE topics ADD COLUMN share_count INTEGER');
    }
    if (!topicColumns.includes('published_at')) {
      db.exec('ALTER TABLE topics ADD COLUMN published_at TEXT');
    }
    if (!topicColumns.includes('fetched_at')) {
      db.exec('ALTER TABLE topics ADD COLUMN fetched_at TEXT');
      db.exec('UPDATE topics SET fetched_at = created_at WHERE fetched_at IS NULL');
    }
    if (!topicColumns.includes('raw_json')) {
      db.exec('ALTER TABLE topics ADD COLUMN raw_json TEXT');
    }

    const creativeColumns = db.prepare("PRAGMA table_info('creatives')").all().map((col: any) => col.name);
    if (!creativeColumns.includes('source_topic_id')) {
      db.exec('ALTER TABLE creatives ADD COLUMN source_topic_id INTEGER');
    }
    if (!creativeColumns.includes('title')) {
      db.exec('ALTER TABLE creatives ADD COLUMN title TEXT');
    }
    if (!creativeColumns.includes('content')) {
      db.exec('ALTER TABLE creatives ADD COLUMN content TEXT');
    }
    if (!creativeColumns.includes('script')) {
      db.exec('ALTER TABLE creatives ADD COLUMN script TEXT');
    }
    if (!creativeColumns.includes('tags')) {
      db.exec('ALTER TABLE creatives ADD COLUMN tags TEXT');
    }
    if (!creativeColumns.includes('cover_style')) {
      db.exec('ALTER TABLE creatives ADD COLUMN cover_style TEXT');
    }
    if (!creativeColumns.includes('model')) {
      db.exec('ALTER TABLE creatives ADD COLUMN model TEXT');
    }

    const publishColumns = db.prepare("PRAGMA table_info('publish_records')").all().map((col: any) => col.name);
    if (!publishColumns.includes('account_id')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN account_id INTEGER');
    }
    if (!publishColumns.includes('theme_id')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN theme_id INTEGER');
    }
    if (!publishColumns.includes('creative_id')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN creative_id INTEGER');
    }
    if (!publishColumns.includes('note_id')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN note_id TEXT');
    }
    if (!publishColumns.includes('xsec_token')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN xsec_token TEXT');
    }
    if (!publishColumns.includes('type')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN type TEXT');
    }
    if (!publishColumns.includes('title')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN title TEXT');
    }
    if (!publishColumns.includes('content')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN content TEXT');
    }
    if (!publishColumns.includes('tags')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN tags TEXT');
    }
    if (!publishColumns.includes('media_urls')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN media_urls TEXT');
    }
    if (!publishColumns.includes('scheduled_at')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN scheduled_at TEXT');
    }
    if (!publishColumns.includes('updated_at')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN updated_at TEXT');
    }
    if (!publishColumns.includes('response_json')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN response_json TEXT');
    }
    if (!publishColumns.includes('error_message')) {
      db.exec('ALTER TABLE publish_records ADD COLUMN error_message TEXT');
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_topics_theme_id ON topics(theme_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_topics_note_id ON topics(note_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_creatives_source_topic_id ON creatives(source_topic_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_publish_records_account_id ON publish_records(account_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_publish_records_theme_id ON publish_records(theme_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_publish_records_creative_id ON publish_records(creative_id)');
  }

  if (currentVersion < 7) {
    db.exec(`
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
    `);
  }

  if (currentVersion < 8) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS trend_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        theme_id INTEGER NOT NULL,
        report_date TEXT NOT NULL,
        stats_json TEXT,
        analysis TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(theme_id) REFERENCES themes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_trend_reports_theme_id ON trend_reports(theme_id);
      CREATE INDEX IF NOT EXISTS idx_trend_reports_date ON trend_reports(report_date);
    `);
  }

  // Migration v9: 定时任务调度系统
  if (currentVersion < 9) {
    // 定时任务表
    db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        job_type TEXT NOT NULL,
        theme_id INTEGER,
        keyword_id INTEGER,
        schedule_type TEXT NOT NULL DEFAULT 'interval',
        interval_minutes INTEGER,
        cron_expression TEXT,
        params_json TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 5,
        last_run_at TEXT,
        next_run_at TEXT,
        last_status TEXT,
        last_error TEXT,
        run_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        fail_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(theme_id) REFERENCES themes(id) ON DELETE CASCADE,
        FOREIGN KEY(keyword_id) REFERENCES keywords(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(is_enabled);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_theme ON scheduled_jobs(theme_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_keyword ON scheduled_jobs(keyword_id);
    `);

    // 任务执行历史表
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER,
        result_json TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        trigger_type TEXT DEFAULT 'scheduled',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(job_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_job_executions_job ON job_executions(job_id);
      CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
      CREATE INDEX IF NOT EXISTS idx_job_executions_started ON job_executions(started_at);
    `);

    // 速率限制状态表
    db.exec(`
      CREATE TABLE IF NOT EXISTS rate_limit_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        scope_id TEXT,
        request_count INTEGER DEFAULT 0,
        window_start TEXT NOT NULL,
        last_request_at TEXT,
        is_blocked INTEGER DEFAULT 0,
        blocked_until TEXT,
        block_reason TEXT,
        UNIQUE(scope, scope_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rate_limit_scope ON rate_limit_state(scope, scope_id);
    `);
  }

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

export function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }
  const dbPath = getDatabasePath();
  ensureDatabaseDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrate(db);
  dbInstance = db;
  return dbInstance;
}

export function getDatabase() {
  if (!dbInstance) {
    return initializeDatabase();
  }
  return dbInstance;
}

export function backupDatabase(destinationPath?: string) {
  const dbPath = getDatabasePath();
  ensureDatabaseDirectory(dbPath);
  const target = destinationPath || `${dbPath}.bak`;
  fs.copyFileSync(dbPath, target);
  return target;
}
