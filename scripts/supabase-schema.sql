-- Supabase Schema for XHS-Generator
-- Run this in Supabase SQL Editor

-- Themes table
CREATE TABLE IF NOT EXISTS themes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  analytics_json TEXT,
  config_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keywords table
CREATE TABLE IF NOT EXISTS keywords (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER REFERENCES themes(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  keyword TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  priority INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  source_ref_id TEXT,
  source_meta_json TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_keywords_theme_id ON keywords(theme_id);

-- Topics (notes) table
CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER REFERENCES themes(id) ON DELETE CASCADE,
  keyword_id INTEGER REFERENCES keywords(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  note_id TEXT,
  xsec_token TEXT,
  url TEXT,
  "desc" TEXT,
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
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ,
  raw_json TEXT,
  status TEXT NOT NULL DEFAULT 'captured',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_topics_theme_id ON topics(theme_id);
CREATE INDEX IF NOT EXISTS idx_topics_keyword_id ON topics(keyword_id);
CREATE INDEX IF NOT EXISTS idx_topics_note_id ON topics(note_id);
CREATE INDEX IF NOT EXISTS idx_topics_source_source_id ON topics(source, source_id);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LLM Providers table
CREATE TABLE IF NOT EXISTS llm_providers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'openai',
  base_url TEXT,
  api_key TEXT,
  model_name TEXT,
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2048,
  is_default INTEGER DEFAULT 0,
  is_enabled INTEGER DEFAULT 1,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prompt Profiles table
CREATE TABLE IF NOT EXISTS prompt_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  system_prompt TEXT NOT NULL,
  user_template TEXT NOT NULL,
  model TEXT,
  temperature REAL,
  max_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trend Reports table
CREATE TABLE IF NOT EXISTS trend_reports (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  stats_json TEXT,
  analysis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trend_reports_theme_id ON trend_reports(theme_id);
CREATE INDEX IF NOT EXISTS idx_trend_reports_date ON trend_reports(report_date);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  xhs_user_id TEXT,
  nickname TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  auth_type TEXT,
  auth_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);

-- Extension Services table
CREATE TABLE IF NOT EXISTS extension_services (
  id SERIAL PRIMARY KEY,
  service_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  api_key TEXT,
  endpoint TEXT,
  config_json TEXT,
  is_enabled INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Competitors table
CREATE TABLE IF NOT EXISTS competitors (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  xhs_user_id TEXT,
  name TEXT,
  last_monitored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_competitors_theme_id ON competitors(theme_id);

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);

-- Creatives table
CREATE TABLE IF NOT EXISTS creatives (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  source_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
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
  result_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creatives_theme_id ON creatives(theme_id);

-- Generation tasks table
CREATE TABLE IF NOT EXISTS generation_tasks (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  creative_id INTEGER REFERENCES creatives(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  prompt TEXT,
  model TEXT,
  result_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  result_json TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_topic_id ON generation_tasks(topic_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_theme_id ON generation_tasks(theme_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);

-- Publish records table
CREATE TABLE IF NOT EXISTS publish_records (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  creative_id INTEGER REFERENCES creatives(id) ON DELETE SET NULL,
  note_id TEXT,
  xsec_token TEXT,
  type TEXT,
  title TEXT,
  content TEXT,
  tags TEXT,
  media_urls TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  response_json TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_publish_records_theme_id ON publish_records(theme_id);
CREATE INDEX IF NOT EXISTS idx_publish_records_status ON publish_records(status);

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  publish_record_id INTEGER REFERENCES publish_records(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_metrics_publish_record_id ON metrics(publish_record_id);
CREATE INDEX IF NOT EXISTS idx_metrics_key_captured_at ON metrics(metric_key, captured_at);

-- Interaction tasks table
CREATE TABLE IF NOT EXISTS interaction_tasks (
  id SERIAL PRIMARY KEY,
  publish_record_id INTEGER REFERENCES publish_records(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interaction_tasks_publish_record_id ON interaction_tasks(publish_record_id);
CREATE INDEX IF NOT EXISTS idx_interaction_tasks_status ON interaction_tasks(status);

-- Form Assist records table
CREATE TABLE IF NOT EXISTS form_assist_records (
  id SERIAL PRIMARY KEY,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  suggestion_json TEXT,
  applied_json TEXT,
  feedback_json TEXT,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_assist_records_theme_id ON form_assist_records(theme_id);

-- Scheduler tables
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  keyword_id INTEGER REFERENCES keywords(id) ON DELETE SET NULL,
  schedule_type TEXT NOT NULL,
  interval_minutes INTEGER,
  cron_expression TEXT,
  params_json TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_theme_id ON scheduled_jobs(theme_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_keyword_id ON scheduled_jobs(keyword_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run_at ON scheduled_jobs(next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(is_enabled);

CREATE TABLE IF NOT EXISTS job_executions (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  result_json TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
CREATE INDEX IF NOT EXISTS idx_job_executions_created_at ON job_executions(created_at);

-- Rate limiter state table
CREATE TABLE IF NOT EXISTS rate_limit_state (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_id TEXT,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_request_at TIMESTAMPTZ,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  block_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_state_scope_scope_id ON rate_limit_state(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_state_is_blocked ON rate_limit_state(is_blocked);

-- Enable Row Level Security (optional, for production)
-- ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE prompt_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE trend_reports ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE extension_services ENABLE ROW LEVEL SECURITY;
