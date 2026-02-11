# 01 Overview

## 项目目标

`xhs-generator` 是一个 Electron + Next.js 的小红书内容生成工作台，核心目标是：
1. 接收用户需求（可带参考图）
2. 通过多 Agent 流程生成文案与配图
3. 通过 SSE 把过程实时反馈给前端
4. 支持 HITL（人工确认）在关键节点中断/恢复

## 当前架构基线

- 运行时采用 **单链路 Agent V2**：
  `supervisor -> brief -> research_evidence -> reference_intelligence -> writer -> layout_planner -> image_planner -> image -> review`
- 每个主要 agent 允许在信息不足时主动 `ask_user`，而不是静默默认生成。
- 旧链路节点（如 `research_agent` / `style_analyzer_agent`）不再作为主运行链路。

## 推荐阅读顺序

1. 先看 `docs/02-architecture/single-flow-v2.md`
2. 再看 `docs/03-agent-flow/runtime-lifecycle.md`
3. 日常调试看 `docs/03-agent-flow/debug-playbook.md`
4. 查字段/事件时看 `docs/04-reference/*`
