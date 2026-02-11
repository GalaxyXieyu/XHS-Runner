# XHS Agent 业务流程（迁移说明）

> 本文档已从“主维护文档”降级为兼容入口，避免与新文档重复。

## 请改为阅读

1. `docs/02-architecture/single-flow-v2.md`（架构与节点职责）
2. `docs/03-agent-flow/runtime-lifecycle.md`（端到端执行流程）
3. `docs/03-agent-flow/clarification-and-hitl.md`（提问与中断恢复机制）
4. `docs/04-reference/*`（API / SSE / State 字段）

## 当前流程基线（单链路）

`supervisor -> brief_compiler_agent -> research_evidence_agent -> reference_intelligence_agent -> writer_agent -> layout_planner_agent -> image_planner_agent -> image_agent -> review_agent`

## 维护约定

- 新增流程/字段/事件，不再更新本文件。
- 只在 `docs/01-overview` ~ `docs/05-ops` 下维护。
