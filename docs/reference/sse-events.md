# SSE 事件枚举（参考）

## 通用流程
- `agent_start`：某个 agent 开始执行（`agent`）
- `agent_end`：某个 agent 完成（`agent`）
- `message`：agent 文本输出（`agent`、`content`）
- `tool_call`：工具调用开始（`agent`、`tool`）
- `tool_result`：工具调用结果（`agent`、`tool`）
- `supervisor_decision`：supervisor 路由决策（`decision`、`reason`）
- `state_update`：关键状态变化摘要（`changes`）

## 内容与图片进度
- `content_update`：writer 内容更新（`title`、`body`、`tags`）
- `image_progress`：单张图片进度（`taskId`、`status`、`progress`、`url`）
- `workflow_progress`：整体进度（`phase`、`progress`、`currentAgent`，可能未启用）

## 意图与类型
- `intent_detected`：意图识别结果（`intent`、`confidence`）
- `content_type_detected`：内容类型识别结果（`contentType`、`confidence`）

## HITL/交互
- `ask_user`：askUser 触发提问（`question`、`options`）
- `confirmation_required`：需要用户确认（`confirmationType`、`data`）
- `workflow_paused`：等待用户响应

## 结束标志
- `[DONE]`：流式输出结束
