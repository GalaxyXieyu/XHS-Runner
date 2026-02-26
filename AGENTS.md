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
`supervisor -> brief_compiler_agent -> research_agent -> reference_intelligence_agent -> writer_agent -> layout_planner_agent -> image_planner_agent -> image_agent -> review_agent`

约束：
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

## Git / 提交规范
- 所有 commit message 必须用中文、描述清楚“改了什么 + 为什么”（必要时补一句验证方式，例如 `npm test` / runDir）。
- 单点改动优先：一条 commit 对应一个 feature point / 一个证据链改动，便于回滚与 diff。

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
- 总入口（文档地图）：`docs/README.md`
- 架构概览：`docs/architecture.md`
- Agent 端到端流程 + 事件协议（排障入口）：`docs/agent-flow.md`
- SSE → UI 渲染链路：`docs/ui-streaming.md`
- 运维 + Prompt 更新：`docs/ops.md`
- XHS ref-image / cover strategy plan：`PLAN_REF_IMAGE_XHS.md`

## Single Source of Truth（你只需要维护一套任务系统）
- 项目 TODO / 进度 / 卡点 / 每次跑完汇报：`AI_TODO.md`
- 固定回归集（20 条）：`tests/regression/xhs-20.yaml`

## Security & Config Notes
- 不提交密钥、令牌、私有数据
- 本地数据目录（如 `data/`）默认视为运行时产物
- 修改默认配置前先阅读部署与运维文档

### Feishu Image Sending (Do This Every Time)

- Goal: the receiver should see the image inline in Feishu ("图片消息" preview). Do NOT ask humans to download.
- Preferred flow (most reliable):
  - If you have an http(s) image URL: download it to `/Volumes/DATABASE/code/.openclaw/media/outbound/` (local file), then send via `message(action=send, filePath=<local>)`.
  - If you already have a local image file: ensure it is under `/Volumes/DATABASE/code/.openclaw/media/outbound/` (copy if needed), then send via `message(action=send, filePath=<local>)`.
- Avoid: sending only a URL, or pasting local absolute paths like `/Volumes/.../image.png` into chat.

## Project North Star & Prompt Iteration Loop

### North Star (可执行定义)
- 输入：用户需求（可选参考图/标题/卖点/风格/限制）。
- 输出：一次跑完即可发布的小红书成套素材（标题/正文结构/封面图或配图），不依赖人工救火。

### Success Metrics (硬指标)
- 一次通过率：不需要补问/重跑/手工修图即可交付的比例。
- 稳定性：同类输入在不同表述、不同长度、信息缺失时，质量波动要小。
- 成本与时延：单次生成时延、调用次数、失败重试可控。

### Iteration Rules (为什么要这么改)
- 固定回归集：先维护一组“典型输入集”（建议 20 条，覆盖多题材/长短输入/缺信息/有无参考图/带约束）。每次改 prompt 都跑同一组，避免凭感觉。
- 单点改动：每轮只改一个 agent 的一个明确段落（其余锁死），否则无法归因。
- 证据驱动：每次修改必须能回答：改了什么、解决了哪个失败模式、怎么验证没伤到别的类。

### Evidence Chain Artifacts (联调证据链)
- `run-progress.json`：实时进度（给人看）。
- `events.jsonl`：时间线（可吵，但不塞全文 prompt；仅保留 hash + preview 等可读字段）。
- `run-summary.json`：结果摘要（标题/标签/图片路径/assetIds 等）。
- `run-evidence.json`：稳定可 diff 的证据链（当前应为 `version: 2`，字段精简、默认无时间戳噪音）。
- `prompts/`：全文 prompt（每张图一个 `.prompt.txt`，用于 diff，不污染 JSON/JSONL）。

### Post-run Report Template (每次跑完必须汇报)
- 结论：本轮“最好/最差”样例各 1-3 个（不在群里贴全文 prompt）。
- 证据：给出对应的 `runDir` 路径 + `run-evidence.json` / `run-summary.json` / `prompts/*.prompt.txt` 的相对路径；必要时只引用 hash/preview。
- 修改计划：下一轮只改哪一个 agent、哪一段（写清楚改动意图），以及预期影响。
- 风险与验证：可能的副作用是什么、用回归集如何确认。

### 汇报口径（大白话 + 3 段）
- 讲法顺序固定：这是什么 → 为啥要它 → 你用它能干嘛。
- 长度固定：最多 3 段，每段 1-2 句；少解释、多给可点开的路径（样例指针）。
- 样例指针定义：`caseId + runDir + image 文件名 + evidence 文件名 + prompt 文件名`，用于快速定位与跨轮对比（diff）。

### Execution Policy (避免阻塞)
- 可能耗时的跑图/回归/验证，优先用 subagent/后台运行；主聊只同步关键进度与最终结果路径。
