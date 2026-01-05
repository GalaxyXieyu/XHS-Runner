const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

const DB_FILENAME = 'xhs-generator.db';
const SCHEMA_VERSION = 2;

let dbInstance;

function getDatabasePath() {
  return path.join(app.getPath('userData'), DB_FILENAME);
}

function ensureDatabaseDirectory(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function migrate(db) {
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

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

function initializeDatabase() {
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

function getDatabase() {
  if (!dbInstance) {
    return initializeDatabase();
  }
  return dbInstance;
}

function backupDatabase(destinationPath) {
  const dbPath = getDatabasePath();
  ensureDatabaseDirectory(dbPath);
  const target = destinationPath || `${dbPath}.bak`;
  fs.copyFileSync(dbPath, target);
  return target;
}

module.exports = {
  backupDatabase,
  getDatabase,
  getDatabasePath,
  initializeDatabase,
};
