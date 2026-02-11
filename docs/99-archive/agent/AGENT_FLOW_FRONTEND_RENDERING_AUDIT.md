# Agent 流程与前端渲染逻辑审计（2026-02）

> 范围：当前主链路（`/api/agent/stream` + `/api/agent/confirm`）与生成页渲染逻辑。
> 
> 本文以代码现状为准，优先描述 **As-Is** 行为，而不是目标设计。

## 1. Agent 当前执行流（As-Is）

### 1.1 入口与初始化

1. 前端 `AgentCreator` 发起 `POST /api/agent/stream`。
2. 服务端在 `stream.ts` 中完成：
   - 参考图输入归一化（`referenceImageUrl` / `referenceImages` / `referenceInputs`）
   - 生成模型选择（`imageGenProvider`）
   - `enableHITL` 时生成 `threadId`
   - 创建 SSE 通道、注册图片进度回调、创建对话记录
   - 意图识别 + 内容类型识别（发 `intent_detected` / `content_type_detected`）
   - 可选预创建 `creative`

参考：`src/pages/api/agent/stream.ts:26`、`src/pages/api/agent/stream.ts:58`、`src/pages/api/agent/stream.ts:264`、`src/pages/api/agent/stream.ts:293`

### 1.2 LangGraph 工作流

图由 `buildGraph` 定义，核心节点为：

`supervisor -> brief_compiler_agent -> research_evidence_agent -> reference_intelligence_agent -> writer_agent -> layout_planner_agent -> image_planner_agent -> image_agent -> review_agent`

其中保留兼容节点：`research_agent`、`style_analyzer_agent`（可被路由到，但不在主确定性顺序里）。

参考：`src/server/agents/graph/graphBuilder.ts:121`、`src/server/agents/graph/graphBuilder.ts:164`

### 1.3 Supervisor 路由策略（关键）

`routeFromSupervisor` 最终采用“**确定性主路由 + 有约束的 LLM 回退**”策略：

- 优先算出确定性目标 `getDeterministicRoute`（按阶段完成标记推进）
- 若 supervisor 输出 `NEXT:`，只在安全条件下允许“回退/同阶段重跑”
- 禁止跳过关键阶段
- 触发关键错误（如正文缺失）时，强制走恢复路径

参考：`src/server/agents/routing/router.ts:137`、`src/server/agents/routing/router.ts:189`

### 1.4 各节点职责（主链）

- `brief_compiler_agent`：提炼创作 brief（结构化）
- `research_evidence_agent`：提取结构化证据包
- `reference_intelligence_agent`：多参考图分析并融合风格参数
- `writer_agent`：生成标题/正文/标签并解析进 `generatedContent`
- `layout_planner_agent`：生成版式规格 `layoutSpec`
- `image_planner_agent`：正文分段、图文绑定、overlay 规划
- `image_agent`：批量生图、落资产、推送 `image_progress`
- `review_agent`：打分并决定是否通过/回流

参考：
`src/server/agents/nodes/briefCompilerNode.ts:38`
`src/server/agents/nodes/researchEvidenceNode.ts:49`
`src/server/agents/nodes/referenceIntelligenceNode.ts:77`
`src/server/agents/nodes/writerNode.ts:9`
`src/server/agents/nodes/layoutPlannerNode.ts:60`
`src/server/agents/nodes/imagePlannerNode.ts:188`
`src/server/agents/nodes/imageNode.ts:8`
`src/server/agents/nodes/reviewNode.ts:151`

### 1.5 HITL 暂停与恢复

当前存在两类暂停来源：

1. **工具级中断**：`askUserTool` 触发 LangGraph `interrupt()`
2. **业务级中断**：`processAgentStream` 在 `writer_agent` / `image_planner_agent` 后主动发 `ask_user` + `workflow_paused`

恢复统一走 `/api/agent/confirm`，内部调用 `resumeWorkflow`：

- `userResponse`（askUser 原生恢复）
- `action=approve/reject/modify`（HITL 确认恢复）

参考：`src/server/agents/tools/askUserTool.ts:75`、`src/server/agents/utils/streamProcessor.ts:320`、`src/pages/api/agent/confirm.ts:271`、`src/server/agents/multiAgentSystem.ts:22`

### 1.6 流事件与持久化

- SSE 事件：`agent_start/agent_end/message/tool_call/tool_result/...`
- 结构化里程碑事件：`brief_ready/layout_spec_ready/alignment_map_ready/quality_score/workflow_complete`
- 持久化：`creative`、`creative_assets`、`conversation_messages`、Langfuse trace/span

注意：`/api/agent/stream` 与 `/api/agent/confirm`/任务链路统一复用 `processAgentStream`，首轮由 `onNodeOutput` 补充结构化事件与入库。

参考：`src/pages/api/agent/stream.ts:529`、`src/server/agents/utils/streamProcessor.ts:64`

---

## 2. 前端渲染逻辑（As-Is）

### 2.1 组件主路径

`App -> CreativeTab -> GenerationSection -> AgentCreator`

`AgentCreator` 负责：
- 请求发起（`/api/agent/stream`, `/api/agent/confirm`）
- SSE 消费
- 事件转消息
- HITL 交互弹层
- 执行轨迹渲染

参考：`src/App.tsx:106`、`src/features/workspace/components/CreativeTab.tsx:90`、`src/features/workspace/components/GenerationSection.tsx:12`、`src/features/agent/components/AgentCreator.tsx:254`

### 2.2 状态层

使用 Zustand `useAgentStreamStore` 管理：

- `messages`：对话消息（用户/助手）
- `events`：完整事件流（驱动轨迹）
- `imageTasks`：图片任务状态
- `askUserDialog`：HITL 交互状态
- `isStreaming/streamPhase/workflowProgress`

参考：`src/features/agent/store/agentStreamStore.ts:18`

### 2.3 SSE 处理链

`processSSEStream` -> `processStreamEvent`：

- 解析 `data: ...`
- 累积 `collectedEvents`
- 即时更新 store
- 将结构化事件转为可读文案（如评分行）
- 在 `workflow_complete` 写入最终消息与图片资产 ID

参考：`src/features/agent/hooks/useStreamProcessor.ts:428`、`src/features/agent/hooks/useStreamProcessor.ts:153`

### 2.4 时间线渲染链

`MessageTypeRenderer` 调用 `buildAgentTimeline` 生成 UI 模型，再由 `AgentTimelineView` 渲染。

关键逻辑：
- 末条 assistant 优先使用实时 `liveEvents`
- 将 `_tools` 归属到父 agent
- `supervisor/supervisor_route` 视为内部节点，不直接展示
- 仅在 `workflow_complete` 后展示最终内容卡

参考：`src/features/agent/components/Messages/MessageTypeRenderer.tsx:52`、`src/features/agent/utils/buildAgentTimeline.ts:67`、`src/features/agent/components/Messages/AgentTimelineView.tsx:224`

### 2.5 HITL 前端交互

- 收到 `ask_user` -> 打开 `InteractiveHITLBubble`
- 用户选择后请求 `/api/agent/confirm`
- `resetEvents=false` 续接事件流，保证轨迹连续

参考：`src/features/agent/hooks/useStreamProcessor.ts:213`、`src/features/agent/components/AgentCreator.tsx:321`

---

## 3. 针对“Agent 流 + 前端渲染”的 Code Review

> 分级：P0（高风险/可能直接失败）> P1（功能或一致性风险）> P2（可维护性风险）

### P0

1. **（已修复）后台/任务链路的 `app.stream` 明确指定 `streamMode`**
   - 已统一为 `streamMode: ["updates", "tasks"]`，与 `processAgentStream` 消费协议一致
   - 位置：`src/pages/api/agent/run-background.ts:126`、`src/server/services/task/taskWorker.ts:280`、`src/server/services/scheduler/jobs/dailyGenerateJob.ts:120`

### P1

2. **（已修复）`/api/agent/stream` 与 `processAgentStream` 统一**
   - 首轮已复用 `processAgentStream`，并通过 `onNodeOutput` 补齐结构化事件与入库
   - 位置：`src/pages/api/agent/stream.ts:529`、`src/server/agents/utils/streamProcessor.ts:64`

3. **（已修复）非 HITL 进度 key 去全局化**
   - 请求级 `streamThreadId` 写入 state.threadId，并用于进度回调与 image_agent 上报
   - 位置：`src/pages/api/agent/stream.ts:55`、`src/server/agents/nodes/imageNode.ts:75`、`src/server/agents/routing/router.ts:243`

4. **（已对齐）前端输入文案与后端上下文一致**
   - 输入提示改为“发起新生成（会重置上下文）”，与每次提交新会话行为一致
   - 位置：`src/features/agent/components/AgentCreator.tsx:548`

### P2

5. **`parseWriterContent` 逻辑重复维护，存在漂移风险**
   - `streamUtils.ts` 与 `contentParser.ts` 各有一份近似实现
   - 一侧改动容易导致首轮/恢复解析不一致
   - 位置：`src/pages/api/agent/streamUtils.ts:10`、`src/server/agents/utils/contentParser.ts:4`
   - 建议：保留单一实现并统一 import
