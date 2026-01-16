# Task Center Data Mapping

## Scope
- 任务中心只做“展示与操作入口”，不合并不同语义的任务表。
- 数据来源分三类：抓取调度（scheduled_jobs）、执行历史（job_executions）、生成任务队列（generation_tasks）。

## Data Sources

### scheduled_jobs（抓取/生成调度）
- Key fields
  - id / name / job_type / theme_id / keyword_id
  - schedule_type / interval_minutes / cron_expression
  - is_enabled / priority
  - next_run_at / last_run_at / last_status / last_error
  - run_count / success_count / fail_count
- UI mapping
  - Tab: 抓取调度
  - 列表字段：任务名、主题、调度方式、启用状态、下次执行、上次状态
  - 操作：启用/暂停、立即执行、跳转主题编辑
- Boundary
  - 仅展示 job_type=capture_theme/capture_keyword（抓取类）
  - daily_generate 归入“生成任务”概念但仍保持独立展示

### job_executions（调度执行历史）
- Key fields
  - id / job_id / status / trigger_type
  - started_at / finished_at / duration_ms
  - result_json / error_message / retry_count / created_at
- UI mapping
  - Tab: 执行历史
  - 列表字段：任务类型、触发方式、耗时、结果、错误
- Boundary
  - 仅做历史记录，不作为调度定义来源

### generation_tasks（内容生成任务队列）
- Key fields
  - id / theme_id / topic_id / creative_id
  - status / prompt / model
  - result_asset_id / result_json / error_message
  - created_at / updated_at
- UI mapping
  - Tab: 生成任务
  - 列表字段：任务名/状态、开始/结束时间、结果数、错误信息
- Boundary
  - 与 scheduled_jobs 不合并，仅在任务中心并排展示

## Notes
- 任务中心以“入口统一 + 语义分栏”为原则，避免混表。
- 过滤条件遵循各表现有字段，不新增字段。
