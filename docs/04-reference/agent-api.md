# Agent API 参考

## `POST /api/agent/stream`

启动一次生成任务并返回 SSE 流。

### 请求体
- `message` (string, required)
- `themeId` (number, optional)
- `referenceImageUrl` (string, optional, 兼容字段)
- `referenceImages` (string[], optional, 兼容字段)
- `referenceInputs` (array, optional) `[{ url, type? }]`，`type in style|layout|content`
- `layoutPreference` (string, optional) `dense|balanced|visual-first`
- `imageGenProvider` (string, optional)
- `enableHITL` (boolean, optional)

### 响应
- `text/event-stream`
- 事件类型见 `docs/04-reference/sse-events.md`

## `POST /api/agent/confirm`

恢复 HITL 中断的线程。

### 请求体
- `threadId` (string, required)
- `action` (string, required) `approve|reject|modify`
- `modifiedData` (object, optional)
- `userFeedback` (string, optional)
- `userResponse` (object, optional, ask_user 回答)

### 响应
- `text/event-stream`
