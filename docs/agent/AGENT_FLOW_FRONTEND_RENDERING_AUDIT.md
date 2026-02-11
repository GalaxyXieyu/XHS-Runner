# Agent 流程与前端渲染审计（迁移版）

> 原始长文审计已归档。该文件保留为兼容入口。
> 请优先阅读：
> - `docs/03-agent-flow/runtime-lifecycle.md`
> - `docs/03-agent-flow/clarification-and-hitl.md`
> - `docs/03-agent-flow/debug-playbook.md`

## 当前审计结论（2026-02）

- 运行时已切到单链路 V2：
  `supervisor -> brief_compiler_agent -> research_evidence_agent -> reference_intelligence_agent -> writer_agent -> layout_planner_agent -> image_planner_agent -> image_agent -> review_agent`
- supervisor + 各关键 agent 均具备 `ask_user` 澄清能力。
- `processAgentStream` 已作为 SSE 事件转换主路径。
- 关键回归脚本：
  - `npm run eval:clarification -- --baseUrl=http://localhost:3000`
  - `npm run eval:agent-clarification`
  - `npm run lint:supervisor-prompt`
