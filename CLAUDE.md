# XHS Generator 工作手册（2026-02）

## 1) 当前系统基线

### Agent 流程（单链路 V2）
`supervisor -> brief_compiler_agent -> research_agent -> reference_intelligence_agent -> writer_agent -> layout_planner_agent -> image_planner_agent -> image_agent -> review_agent`

### 关键原则
- 每个 agent 可在输入不足时主动 `ask_user`
- supervisor 负责路由与回退，但不应绕过 review 质量门禁
- 文档维护以 `docs/01~05` 为主，历史文档仅归档

## 2) 快速命令

### 开发与构建
- `npm run dev`
- `npm run dev:next`
- `npm run build:server`

### 澄清能力回归
- `npm run lint:supervisor-prompt`
- `npm run eval:agent-clarification`
- `npm run eval:clarification -- --baseUrl=http://localhost:3000`

### Prompt 同步
- `npx tsx scripts/sync-prompts-to-langfuse.ts`

## 3) 代码索引

- Graph 构建：`src/server/agents/graph/graphBuilder.ts`
- 路由策略：`src/server/agents/routing/router.ts`
- 状态定义：`src/server/agents/state/agentState.ts`
- 节点实现：`src/server/agents/nodes/*.ts`
- 流处理：`src/server/agents/utils/streamProcessor.ts`
- API 入口：`src/pages/api/agent/stream.ts`

## 4) 文档索引（推荐入口）

- 总览：`docs/README.md`
- 架构：`docs/02-architecture/single-flow-v2.md`
- 生命周期：`docs/03-agent-flow/runtime-lifecycle.md`
- 提问/HITL：`docs/03-agent-flow/clarification-and-hitl.md`
- 调试手册：`docs/03-agent-flow/debug-playbook.md`
- 参考：`docs/04-reference/README.md`
- 运维：`docs/05-ops/README.md`

## 5) 历史文档策略

- 历史内容保留在原目录与 `docs/99-archive/README.md` 索引中
- 新需求、新规则、新接口只更新 01~05 结构
