# 单链路 Agent V2 架构

## 1. 设计原则

- **单链路**：只有一条主执行链，减少“分叉 + 兼容分支”带来的不确定性。
- **状态驱动**：路由默认由 `AgentState` 决定，`supervisor` 的 `NEXT:` 只允许安全回退。
- **可追问**：每个关键 agent 在输入不足时优先 `ask_user`。
- **可观测**：每个节点输出统一转为 SSE 事件，支持前端实时渲染与回放。

## 2. 节点序列

1. `supervisor`
2. `brief_compiler_agent`
3. `research_evidence_agent`
4. `reference_intelligence_agent`
5. `writer_agent`
6. `layout_planner_agent`
7. `image_planner_agent`
8. `image_agent`
9. `review_agent`

## 3. 路由规则（实现口径）

- 主路由入口：`src/server/agents/routing/router.ts`
- 图构建入口：`src/server/agents/graph/graphBuilder.ts`
- 当状态机目标是 `review_agent` 时，不允许 supervisor 跳过 review 回退到更早阶段（review 作为质量门禁）。

## 4. 统一澄清机制

- 公共工具：`src/server/agents/utils/agentClarification.ts`
- 需求清晰度分析：`src/server/agents/utils/requirementClarity.ts`
- supervisor 与各 agent 都可触发 `ask_user`，上下文通过 `context.__agent_clarification` 标识。

## 5. Prompt 管理

- Prompt 源：`prompts/*.yaml`
- 同步脚本：`scripts/sync-prompts-to-langfuse.ts`
- 当前只同步单链路核心 prompt（不含已下线链路）。
