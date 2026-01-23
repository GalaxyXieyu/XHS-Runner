# Repository Guidelines

## Project Structure & Module Organization
This repo is an Electron + Next.js app. The main process lives in `electron/` (IPC + window lifecycle), while domain services live in `src/server/services/xhs/` and are compiled to `electron/server/`. The renderer UI lives in `src/pages/`. Operational docs live in `docs/`, and local runtime artifacts are stored in `data/` (keep generated data out of commits).

## Build, Test, and Development Commands
- `npm run dev`: start Next.js, then launch Electron after the renderer is ready.
- `npm run dev:next`: run the renderer only.
- `npm run dev:electron`: run Electron only after `http://localhost:3000` is ready.
- `npm run build:server`: compile server-side TypeScript to `electron/server/`.
- `npm run build`: build the Next.js renderer.
- `npm run start`: serve the built renderer.
- `npm run pack`: create an unpacked Electron build in `dist/`.
- `npm run dist` / `dist:mac` / `dist:win`: produce packaged installers.

## Coding Style & Naming Conventions
- TypeScript/JavaScript uses 2-space indentation, single quotes, and semicolons. Follow patterns in `src/pages/index.tsx` and `src/server/services/xhs/*.ts`.
- Module files are camelCase (for example, `workflowService.ts`), and React component names are PascalCase.
- Keep functions small and prefer explicit IPC calls over implicit globals.

## Testing Guidelines
There is no automated test runner configured in `package.json` yet. For changes, run a manual smoke test with `npm run dev` and exercise the UI. If you add tests, create a `tests/` or `__tests__/` directory and wire a `npm test` script.

## Commit & Pull Request Guidelines
- Commit messages use a ticket prefix: `[XHS-###] Short, imperative summary`.
- PRs should include a concise summary, test steps (commands + results), and screenshots for UI changes. Note target OS for packaging changes.

## Security & Configuration Tips
Review `docs/Config.md` and `docs/Settings.md` before changing defaults. Avoid committing credentials or local data; use environment variables or local configs ignored by Git.

## Database Operations (Supabase MCP)

> **推荐**: 使用 Supabase MCP 进行所有数据库操作，无需手动脚本。

### 项目信息
- **Project ID**: `emfhfxayynshmgkxdccb`
- **Project Name**: `xhs_collectors`
- **Region**: `ap-south-1`

### MCP 工具列表

| 工具 | 用途 |
|------|------|
| `mcp__supabase__list_tables` | 查看表结构 |
| `mcp__supabase__execute_sql` | 执行 SELECT/INSERT/UPDATE/DELETE |
| `mcp__supabase__apply_migration` | 执行 DDL (CREATE/ALTER/DROP) |
| `mcp__supabase__list_migrations` | 查看迁移历史 |
| `mcp__supabase__get_logs` | 查看服务日志 |
| `mcp__supabase__get_advisors` | 安全/性能建议 |

### 使用示例

```yaml
# 查询数据
mcp__supabase__execute_sql:
  project_id: emfhfxayynshmgkxdccb
  query: "SELECT * FROM topics LIMIT 10"

# 插入数据
mcp__supabase__execute_sql:
  project_id: emfhfxayynshmgkxdccb
  query: "INSERT INTO themes (name, status) VALUES ('新主题', 'active')"

# 更新数据
mcp__supabase__execute_sql:
  project_id: emfhfxayynshmgkxdccb
  query: "UPDATE topics SET status = 'archived' WHERE id = 1"

# 删除数据
mcp__supabase__execute_sql:
  project_id: emfhfxayynshmgkxdccb
  query: "DELETE FROM topics WHERE id = 1"

# 创建表/修改结构 (使用 migration)
mcp__supabase__apply_migration:
  project_id: emfhfxayynshmgkxdccb
  name: "add_index_on_topics"
  query: "CREATE INDEX idx_topics_like ON topics(like_count DESC)"
```

### 注意事项
- DDL 操作 (CREATE/ALTER/DROP) 必须使用 `apply_migration`
- DML 操作 (SELECT/INSERT/UPDATE/DELETE) 使用 `execute_sql`
- 迁移名称使用 snake_case 格式

## Prompt Management Workflow
1. **Source of Truth**: All agent prompts are defined in `prompts/*.yaml`.
2. **Editing**: Edit the YAML file directly. Do not modify prompts in TypeScript code.
3. **Syncing**: Run `npx tsx scripts/sync-prompts-to-langfuse.ts` to push changes to Langfuse and the database.
4. **Validation**: The script verifies that the prompts were successfully uploaded.

## 架构与 Agent 运行说明（中文）

### 整体架构
- Electron 主进程（`electron/main.js`）负责 IPC 与窗口生命周期；preload 暴露桥接 API（`electron/preload.js`）。
- Renderer UI 运行在 Next.js（`src/pages/` + `src/components/`）。
- Next API 作为桥接入口（`src/pages/api/`），调用服务层（`src/server/services/xhs/`）。
- 服务层构建后进入 `electron/server/`，桌面端运行时复用。
- Agent 流式输出通过 SSE（`/api/agent/stream`）。

### Agent 逻辑（LangGraph）
- 入口在 `createMultiAgentSystem`/`buildGraph`，状态机包含 supervisor + research + writer + style_analyzer + image_planner + image + review。
- supervisor 根据状态或显式 `NEXT:` 决策路由；review 未通过则回 supervisor 迭代（默认最多 3 次）。
- HITL 在 writer/image_planner 后中断，前端确认后 `resumeWorkflow` 继续。
- 工具调用通过 ToolNode 执行，工具结果可写入 Langfuse span。

### 提示词同步与读取
- 统一存放在 `prompts/*.yaml`，脚本 `npx tsx scripts/sync-prompts-to-langfuse.ts` 上传 Langfuse（production 标签）。
- 运行时 `promptManager` 优先从 Langfuse 拉取并缓存 5 分钟，失败回退到数据库 `agent_prompts`。
- UI 侧还有 `prompt_profiles` 管理（`/api/settings/prompts`），与 Langfuse 体系并行。

### 数据库连接
- Drizzle 连接 Postgres：`DATABASE_URL` / `POSTGRES_URL` / `SUPABASE_DB_URL`（`src/server/db/index.ts`）。
- `pg` 直连仅使用 `DATABASE_URL`（`src/server/pg.ts`）。
- Supabase JS 用于遗留/前端：`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`（`src/server/supabase.ts`, `src/lib/supabase.ts`）。

### 优化建议
- 统一提示词“单一真源”，打通 UI 更新与 Langfuse 同步，避免双来源冲突。
- 统一数据库连接字符串解析，避免 `pg` 与 Drizzle 读取不同环境变量。
- 将 `imageToolCallCount` 从进程级全局迁移到 thread/state，避免并发请求互相干扰。
- prompts YAML 解析改用正式解析器，增加“无变更不上传”校验。
- Langfuse 配置解析加容错，避免 `config_json` 损坏导致链路不可用。
