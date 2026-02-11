# SSE 事件清单

事件定义来源：`src/server/agents/state/agentState.ts` + `stream.ts`/`streamProcessor.ts`。

## 生命周期
- `agent_start`
- `agent_end`
- `workflow_complete`

## 文本与工具
- `message`
- `progress`
- `tool_call`
- `tool_result`
- `supervisor_decision`

## 业务产物
- `content_update`
- `image_progress`
- `workflow_progress`
- `brief_ready`
- `layout_spec_ready`
- `alignment_map_ready`
- `quality_score`

## 交互
- `ask_user`
- `workflow_paused`

## 诊断/状态
- `state_update`
- `intent_detected`
- `content_type_detected`
