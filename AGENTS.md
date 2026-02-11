# Repository Guidelines

## Project Structure & Module Organization
- 桌面容器：`electron/`（窗口生命周期、IPC、preload）
- 前端渲染：`src/pages/` + `src/features/` + `src/components/`
- Agent 运行时：`src/server/agents/`
- 业务服务：`src/server/services/xhs/`
- 数据层：`src/server/db/`（Postgres + Drizzle）
- 文档：`docs/`（已按 01~05 分层）

## Agent Runtime Baseline（Single-flow V2）

当前统一链路：
`supervisor -> brief_compiler_agent -> research_evidence_agent -> reference_intelligence_agent -> writer_agent -> layout_planner_agent -> image_planner_agent -> image_agent -> review_agent`

约束：
- 不再以旧链路（`research_agent` / `style_analyzer_agent`）作为主流程。
- 每个关键 agent 都应具备在输入不足时主动 `ask_user` 的能力。
- review 是质量门禁，路由策略不能随意跳过。

## Build, Test, and Development Commands
- `npm run dev`：Next + Electron 联调
- `npm run dev:next`：仅启动前端
- `npm run dev:electron`：仅启动 Electron（需先有 3000 端口）
- `npm run build:server`：编译 server TS 到 `electron/server/`
- `npm run build`：构建 Next.js
- `npm run pack` / `npm run dist`：打包桌面应用

## Agent Quality / Clarification Checks
- `npm run lint:supervisor-prompt`
- `npm run eval:agent-clarification`
- `npm run eval:clarification -- --baseUrl=http://localhost:3000`

## Coding Style & Constraints
- TypeScript/JavaScript：2 空格、single quotes、分号
- 文件命名：模块用 camelCase，React 组件用 PascalCase
- 单文件建议 ≤ 800 行，超过请拆分
- 默认保持向后兼容；若要硬切链路，需同步更新文档与脚本

## Prompt Management Workflow
1. Prompt 源文件：`prompts/*.yaml`
2. 直接编辑 YAML，不在 TS 中硬编码 prompt
3. 同步：`npx tsx scripts/sync-prompts-to-langfuse.ts`
4. 验证：同步后检查脚本输出与运行行为

## Database Operations
- 统一使用 Postgres + Drizzle（`src/server/db`）
- 直查优先 `psql` 或一次性 `tsx` 脚本
- 迁移脚本在 `scripts/migrate-db/`

## Documentation Index（必读）
- 总入口：`docs/README.md`
- 架构：`docs/02-architecture/single-flow-v2.md`
- 流程：`docs/03-agent-flow/runtime-lifecycle.md`
- 调试：`docs/03-agent-flow/debug-playbook.md`
- API/SSE/State：`docs/04-reference/`
- 运维命令：`docs/05-ops/commands-and-checks.md`

## Security & Config Notes
- 不提交密钥、令牌、私有数据
- 本地数据目录（如 `data/`）默认视为运行时产物
- 修改默认配置前先阅读部署与运维文档
