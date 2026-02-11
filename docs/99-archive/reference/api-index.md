# API 索引（参考）

## `/api/agent/stream`

- 方法：POST
- 作用：启动生成并以 SSE 事件流返回进度
- 请求体字段：
  - `message`：用户需求文本（必填）
  - `themeId`：主题 ID（可选）
  - `referenceImageUrl`：单张参考图（可选）
  - `referenceImages`：多张参考图（可选）
  - `imageGenProvider`：图片服务商（`jimeng`/`gemini`，可选）
  - `enableHITL`：是否启用人工确认（可选）
- 响应：SSE 事件流，事件类型详见 `docs/99-archive/reference/sse-events.md`

## `/api/agent/confirm`

- 方法：POST
- 作用：HITL 确认/修改/拒绝后恢复工作流
- 请求体字段：
  - `threadId`：工作流线程 ID（必填）
  - `action`：`approve` / `reject` / `modify`
  - `modifiedData`：修改后的内容或图片规划（可选）
  - `userFeedback`：拒绝原因（`reject` 时必填）
  - `saveAsTemplate`：保存为模板（可选）
  - `userResponse`：askUser 工具的用户回答（可选）
- 响应：SSE 事件流（同 `/api/agent/stream`）
