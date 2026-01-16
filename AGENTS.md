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
