# Agent 运行生命周期

## 1. 请求进入

- 前端调用 `POST /api/agent/stream`
- 后端在 `src/pages/api/agent/stream.ts`：
  - 初始化 SSE 响应
  - 识别意图与内容类型
  - 初始化 `AgentState`
  - 启动 LangGraph 流

## 2. 流式执行

- `processAgentStream`（`src/server/agents/utils/streamProcessor.ts`）把图执行输出转为统一事件：
  - `agent_start` / `agent_end`
  - `message`
  - `tool_call` / `tool_result`
  - `ask_user` / `workflow_paused`
  - `content_update` / `image_progress` 等业务事件

## 3. HITL 中断与恢复

- 中断：agent 内调用 `askUser` 工具触发 LangGraph `INTERRUPT`
- 恢复：前端提交 `/api/agent/confirm`
- 线程标识：`threadId`

## 4. 结束与落库

- 流程完成后输出 `[DONE]`
- 内容/图片/事件落库并写入 Langfuse trace
- 如客户端中断，流程会尝试把当前 creative 标记为 `aborted`
