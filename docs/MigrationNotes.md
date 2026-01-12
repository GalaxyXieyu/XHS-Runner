# Migration Notes

## Manual Smoke Checklist
1. `npm install`
2. `npm run dev`
3. Verify theme list loads (or create a new theme).
4. Open Creative tab and generate/apply feedback via Form Assist.
5. Open Operations tab and refresh publish queue.

## Database Rebuild
- Remove the local DB file (userData/xhs-generator.db) to force a clean rebuild.
- Launch the Electron app to re-run migrations.

## Supabase Security Model

### Key 使用规则
- ✅ 允许：`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`（可分发/可在客户端使用）。
- ❌ 禁止：把 Supabase `service_role` key 打包进 Electron/前端产物（等同于“全库管理员权限”泄露）。
- 如需“管理员权限写入”（例如写入敏感字段、批量迁移/清理）：推荐通过受控的 Server/Edge Function 承接（运行在可信环境），客户端仅调用受保护的接口。

### Auth / RLS（默认建议）
- 默认建议启用 Supabase Auth + RLS，所有表按“用户/工作区”做行级隔离（避免 anon key 可被滥用写入全库）。
- PoC/单机快速落地可临时关闭 RLS，但必须明确这是开发/私有环境策略，且需要网络隔离与最小权限配置。

### 数据隔离字段（草案）
- 推荐新增或统一以下字段（按表需要）：`user_id`（auth.users.id）、`workspace_id`（多工作区时）。
- RLS 策略草案：`user_id = auth.uid()`（或 workspace 成员校验），禁止跨用户读取/写入。

### Client / Server / Edge 边界（草案）
- 允许在客户端直连（前提：RLS 生效）：themes/keywords/topics 等非敏感业务数据的 CRUD。
- 必须走 Server/Edge（避免敏感泄露）：`llm_providers.api_key`、`extension_services.api_key`、`accounts.auth_json` 等敏感字段的写入/读取；以及任何需要批量维护/迁移权限的操作。

## XHS Core Configuration
- Build core before running: `npm run build:xhs-core`.
- Use `XHS_MCP_DRIVER=mock` for local dry runs.
