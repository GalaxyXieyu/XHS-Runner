# Migration Mapping: Prototype to Electron + Next

## Scope
This document maps the Vite prototype UI to the current Electron + Next renderer,
identifies ownership, and defines the minimum data contracts and IPC endpoints
needed for the theme-driven workflow.

## Module Mapping (UI -> Renderer -> Backend)
| Prototype Module | Renderer Target | Backend Service / IPC | Notes |
| --- | --- | --- | --- |
| ThemeManagement | `src/pages/index.tsx` (Theme view) | `themes:list`, `themes:create`, `themes:update`, `themes:remove`, `themes:setStatus` | Replace in-memory themes state. |
| InsightTab | Theme workspace (Insight) | `insights:refresh`, `insights:get`, `topics:list`, `topics:updateStatus` | Align with capture + analysis pipeline. |
| CreativeTab | Theme workspace (Creative) | `creatives:generate`, `creatives:list`, `generation:enqueue`, `generation:stats` | Reuse generation queue where possible. |
| OperationsTab | Theme workspace (Operations) | `publish:enqueue`, `publish:list`, `metrics:summary`, `interactions:list`, `interactions:enqueue` | Publish + comment automation. |
| Settings | Settings view | `settings:get`, `settings:set`, `config:get`, `config:set` | Existing IPC already supports these. |

## Data Contracts (Minimum Fields)
### Theme
- id
- name
- description
- status (active | paused | completed)
- keywords (string[])
- competitors (string[])
- created_at
- analytics_json (optional cached insights)

### Insight
- theme_id
- top_tags (string[])
- title_patterns (string[])
- comment_insights (string[])
- notes (list of { id, title, url, metrics? })
- generated_at

### Creative
- id
- theme_id
- prompt
- result_asset_id
- status (queued | generating | done | failed)
- created_at

### Operations
- publish_records (id, task_id, platform, status, published_at)
- metrics (publish_record_id, metric_key, metric_value, captured_at)
- interaction_tasks (id, publish_record_id, type, status, content)

### Settings
- captureEnabled
- captureFrequencyMinutes
- captureRateLimitMs
- captureRetryCount
- metricsWindowDays
- config (updateChannel, logLevel)

## Required IPC Endpoints (Minimum Set)
### Theme + Competitor
- themes:list
- themes:create
- themes:update
- themes:remove
- themes:setStatus
- competitors:list
- competitors:add
- competitors:remove

### Insight / Capture / Analysis
- insights:refresh (trigger local fetch + analysis)
- insights:get (return cached analytics_json)
- topics:list
- topics:updateStatus

### Creative / Generation
- creatives:generate
- creatives:list
- creatives:update
- generation:enqueue
- generation:stats

### Operations / Publish / Interaction
- publish:enqueue
- publish:list
- metrics:summary
- metrics:export
- interactions:list
- interactions:enqueue

## DB Inventory (Postgres / Supabase)

### Current data surface (observed)
- Tables (union of docs + code usage): `themes`, `keywords`, `competitors`, `topics`, `generation_tasks`, `publish_records`, `metrics`, `settings`, `assets`, `creatives`, `prompt_profiles`, `llm_providers`, `trend_reports`, `accounts`, `extension_services`, `interaction_tasks`, `scheduled_jobs`, `job_executions`, `rate_limit_state`, `form_assist_records`.

### Existing Supabase data surface
- Schema already defined in `scripts/supabase-schema.sql`: `themes`, `keywords`, `topics`, `settings`, `llm_providers`, `prompt_profiles`, `trend_reports`, `accounts`, `extension_services`.
- Tables already referenced via Supabase client in code: `themes`, `keywords`, `competitors`, `topics`, `generation_tasks`, `settings`, `extension_services`.

### Gap / To Add or Align (for full migration)
- Missing in Supabase schema but still used by services: `generation_tasks`, `publish_records`, `metrics`, `assets`, `competitors`, `creatives`, `interaction_tasks`, `scheduled_jobs`, `job_executions`, `rate_limit_state`, `form_assist_records`.
- Type/constraint alignment needed for Postgres/Supabase behavior differences (timestamps, upserts, primary key returns).

## References
- plan/2026-01-07_16-42-18-prototype-migration-mcp.md:16
- prd.md:1
