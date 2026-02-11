# Agent 架构文档（迁移说明）

该文档已降级为历史入口，避免与当前实现重复维护。

## 当前主维护文档

- 架构：`docs/02-architecture/single-flow-v2.md`
- 运行流程：`docs/03-agent-flow/runtime-lifecycle.md`
- 澄清/HITL：`docs/03-agent-flow/clarification-and-hitl.md`
- 调试手册：`docs/03-agent-flow/debug-playbook.md`

## 当前基线

运行时采用单链路 V2：
`supervisor -> brief_compiler_agent -> research_evidence_agent -> reference_intelligence_agent -> writer_agent -> layout_planner_agent -> image_planner_agent -> image_agent -> review_agent`

历史版本细节请参考 Git 历史记录。
