# 项目说明（xhs-generator）

> 目标：用一份文档讲清“项目整体功能与边界”，其余内容分别下沉到流程、前端渲染、运维文档。

## 1. 项目定位与边界

**定位**：Electron + Next.js 的小红书内容生成工作台，围绕「需求输入 → 多 Agent 生成 → 实时可视化 → 人工确认 → 产出可发布内容」构建。

**输入**：
- 用户需求文本（`message`）
- 参考图（单图 `referenceImageUrl` 或多图 `referenceImages/referenceInputs`）
- 可选配置（如 `layoutPreference`、`imageGenProvider`、`enableHITL`）

**输出**：
- 文案结果（标题 / 正文 / 标签）
- 图片资产（生成图/引用图）
- 过程可视化（SSE 实时事件流）

## 2. 核心能力

- **单链路 Agent V2**：`supervisor → brief → research_evidence → reference_intelligence → writer → layout_planner → image_planner → image → review`
- **统一澄清与 HITL**：需求不清时主动追问，关键节点可暂停等待用户确认
- **流式可视化**：SSE 推送执行轨迹、产物更新、进度与审核信息
- **图文协同生产**：文案、图片规划、生成与审核在同一链路内完成
- **质量门禁与回流**：审核打分不足时按低分维度回流再优化

## 3. 系统模块与目录

| 模块 | 目录 | 说明 |
| --- | --- | --- |
| 桌面容器 | `electron/` | 应用窗口与 IPC 入口 |
| 前端渲染 | `src/pages/` `src/features/` | 交互 UI、SSE 渲染与状态管理 |
| Agent 运行时 | `src/server/agents/` | LangGraph 节点、路由与工具 |
| 业务服务 | `src/server/services/xhs/` | 内容/图片/模板等业务逻辑 |
| 数据层 | `src/server/db/` | Postgres + Drizzle |
| Prompt 管理 | `prompts/` | YAML 形式的 prompt 源 |

## 4. 核心数据对象

- **creative**：一次内容生成的主记录（标题/正文/标签/状态）
- **assets**：图片资产（生成图、引用图、元数据）
- **AgentState**：运行时状态聚合（流程控制、产物、审核、错误）
- **SSE 事件**：前端实时渲染的过程事件流（见 `docs/agent-flow.md`）

## 5. 技术栈概览（核心）

| 层级 | 技术选型 |
| --- | --- |
| Agent 框架 | LangGraph + LangChain |
| LLM | OpenAI 兼容 API（可配置 Base URL + API Key） |
| 状态持久化 | PostgresSaver (Postgres) |
| 观测追踪 | Langfuse |
| 通信协议 | SSE (Server-Sent Events) |
| 图片生成 | Jimeng / Gemini 等可配置 Provider |

## 6. 端到端流程概览（高层）

1. 前端发起 `POST /api/agent/stream`，建立 SSE 通道
2. supervisor 决策进入各 Agent 节点（研究 → 文案 → 图片规划 → 生成 → 审核）
3. 过程中持续推送 `message` / `tool_call` / `content_update` / `image_progress` 等事件
4. 如需确认，触发 `ask_user` + `workflow_paused`，前端通过 `/api/agent/confirm` 恢复
5. 审核通过后输出 `[DONE]` 与 `workflow_complete`

## 7. 文档地图（精简版）

- **Agent 流程**：`docs/agent-flow.md`
- **流式渲染前端逻辑**：`docs/ui-streaming.md`
- **部署与提示词更新**：`docs/ops.md`

## 8. 维护约定

- Prompt 修改只在 `prompts/*.yaml`，并同步到 Langfuse
- 新增事件/字段请同步更新 `docs/agent-flow.md`
- 避免在文档中写入敏感信息（IP/密码/密钥）

## 历史文档

历史文档统一收敛在 `docs/99-archive/`（只读，避免与现行实现混淆）。
