# 文档总览（V2）

> 目标：把“业务主流程、实现细节、运维操作”拆开，减少重复与冲突。
> 当前统一按 **单链路 Agent V2** 维护（不再以旧链路为主）。

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

## 推荐阅读顺序（合并版）

1. `docs/architecture.md`：单链路 V2 架构、Langfuse Pipeline、统一后台任务架构
2. `docs/agent-flow.md`：运行生命周期、澄清/HITL、调试手册
3. `docs/reference.md`：Agent API / SSE 事件 / 状态字段 / 工具清单 / 技术选型
4. `docs/ops.md`：开发流程、命令清单、测试与部署/CI
5. `docs/ui-streaming-design.md`：流式输出 UI 设计规划

## 历史文档

历史设计记录与旧结构文档已统一收敛到 `docs/99-archive/`，
新内容优先写入上述合并版目录。历史内容索引见：
- `docs/99-archive/README.md`
