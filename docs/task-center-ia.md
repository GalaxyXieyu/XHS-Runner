# Task Center IA

## Entry Point
- Sidebar 一级入口：任务中心
- 目标：把抓取调度、生成任务、执行历史汇总到同一入口，但分栏展示

## Tabs
### 抓取调度
- 数据源：scheduled_jobs（job_type=capture_theme/capture_keyword）
- 列表字段：任务名、主题、调度方式、启用状态、下次执行、上次状态
- 操作：启用/暂停、立即执行、跳转主题编辑
- 过滤：状态（启用/暂停）、主题（可选）

### 生成任务
- 数据源：generation_tasks
- 列表字段：任务名/状态、开始/结束时间、进度、结果数、错误信息
- 操作：查看结果、查看失败原因
- 过滤：状态（queued/running/done/failed）、时间范围

### 执行历史
- 数据源：job_executions
- 列表字段：任务类型、触发方式、耗时、结果、错误
- 操作：查看详情（结果/错误）
- 过滤：任务类型、触发方式、时间范围

## Cross-cutting UX
- 空态：对应 Tab 提示文案与建议操作
- 加载态：统一加载骨架或 Spinner
- 列表分页：默认 limit，允许翻页或加载更多

## Consistency
- 术语与现有页面一致（抓取、定时任务、执行历史）
- 不与主题页/创作页已有入口冲突
