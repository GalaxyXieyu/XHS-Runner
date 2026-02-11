# Reference

## Agent API

### `POST /api/agent/stream`

启动一次生成任务并返回 SSE 流。

#### 请求体
- `message` (string, required)
- `themeId` (number, optional)
- `referenceImageUrl` (string, optional, 兼容字段)
- `referenceImages` (string[], optional, 兼容字段)
- `referenceInputs` (array, optional) `[{ url, type? }]`，`type in style|layout|content`
- `layoutPreference` (string, optional) `dense|balanced|visual-first`
- `imageGenProvider` (string, optional)
- `enableHITL` (boolean, optional)

#### 响应
- `text/event-stream`
- 事件类型见本文档「SSE 事件清单」

### `POST /api/agent/confirm`

恢复 HITL 中断的线程。

#### 请求体
- `threadId` (string, required)
- `action` (string, required) `approve|reject|modify`
- `modifiedData` (object, optional)
- `userFeedback` (string, optional)
- `userResponse` (object, optional, ask_user 回答)

#### 响应
- `text/event-stream`


## SSE 事件清单

事件定义来源：`src/server/agents/state/agentState.ts` + `stream.ts`/`streamProcessor.ts`。

### 生命周期
- `agent_start`
- `agent_end`
- `workflow_complete`

### 文本与工具
- `message`
- `progress`
- `tool_call`
- `tool_result`
- `supervisor_decision`

### 业务产物
- `content_update`
- `image_progress`
- `workflow_progress`
- `brief_ready`
- `layout_spec_ready`
- `alignment_map_ready`
- `quality_score`

### 交互
- `ask_user`
- `workflow_paused`

### 诊断/状态
- `state_update`
- `intent_detected`
- `content_type_detected`


## AgentState 关键字段

> 完整定义见 `src/server/agents/state/agentState.ts`。

### 路由与流程
- `currentAgent`
- `iterationCount` / `maxIterations`
- `briefComplete`
- `evidenceComplete`
- `referenceIntelligenceComplete`
- `contentComplete`
- `layoutComplete`
- `imagesComplete`

### 输入与上下文
- `messages`
- `threadId`
- `referenceImageUrl`
- `referenceImages`
- `referenceInputs`
- `layoutPreference`
- `contentType`

### 中间产物
- `creativeBrief`
- `evidencePack`
- `referenceAnalyses`
- `layoutSpec`
- `paragraphImageBindings`
- `textOverlayPlan`
- `imagePlans`

### 结果与质量
- `generatedContent`
- `generatedImagePaths`
- `generatedImageAssetIds`
- `reviewFeedback`
- `qualityScores`

### 交互控制
- `pendingConfirmation`
- `agentClarificationKeys`
- `lastError`


## Tools Catalog

### supervisor
- `managePrompt`
- `recommendTemplates`
- `askUser`

### research_evidence_agent
- `searchNotes`
- `analyzeTopTags`
- `getTopTitles`
- `getTrendReport`
- `webSearch`
- `askUser`

### reference_intelligence_agent
- 主要走节点内分析逻辑（参考图语义/风格解析）

### writer/layout/image_planner/review
- 通过 `askUser` 做补充澄清

### image_agent
- `generateImage`
-（动态路径）`generate_with_reference` / `generate_images_batch`

> 以代码为准：`src/server/agents/tools/index.ts`


## 技术选型表

| 层级 | 技术选型 |
|-----|---------|
| Agent 框架 | LangGraph + LangChain |
| LLM | OpenAI 兼容 API (可配置 Base URL + API Key) |
| 状态持久化 | PostgresSaver (Postgres) |
| 链路追踪 | Langfuse |
| 通信协议 | SSE (Server-Sent Events) |
| 图片生成 | 火山引擎即梦 (Jimeng) + Gemini Vision |
