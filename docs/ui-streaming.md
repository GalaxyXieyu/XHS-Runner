# 流式渲染前端组件逻辑

本文件描述 **SSE 流到 UI 的完整链路**，包含事件处理、时间线构建与 HITL 交互展示。

## 1. 数据流总览

```
/api/agent/stream (SSE)
  → useStreamProcessor.processSSEStream
  → processStreamEvent（按事件类型更新 state）
  → MessageTypeRenderer + AgentTimelineView 渲染
```

关键入口：
- `src/features/agent/hooks/useStreamProcessor.ts`
- `src/features/agent/components/Messages/MessageTypeRenderer.tsx`
- `src/features/agent/components/Messages/AgentTimelineView.tsx`
- `src/features/agent/utils/buildAgentTimeline.ts`

## 2. SSE 事件 → UI 映射

| 事件类型 | 主要影响 | 说明 |
| --- | --- | --- |
| `message` | assistant 内容流 | 追加到当前 assistant 消息正文 |
| `progress` | 执行轨迹 | 更新消息的 events（用于时间线） |
| `content_update` | 文案卡片 | 覆盖标题/正文/标签为结构化内容 |
| `image_progress` | 图片任务 | 生成任务状态/进度 → 图片任务卡 |
| `workflow_progress` | 进度文案 | 更新 `streamPhase` |
| `ask_user` | HITL 弹窗 | 历史消息记录 + 打开交互弹窗 |
| `workflow_paused` | 停止流 | 关闭 streaming 状态，保留事件轨迹 |
| `workflow_complete` | 最终产物 | 固化最终内容 + 图片资产 |

## 3. 事件处理细节（useStreamProcessor）

**入口函数**：`processSSEStream`
- 统一解析 SSE `data:` 行
- 将事件存入 `events` 列表
- 调用 `processStreamEvent` 做细粒度 UI 更新

**关键行为**：
- `ask_user`：追加 HITL 消息 → 打开弹窗（`AskUserDialogState`）
- `workflow_paused`：立即停止 streaming 并同步事件轨迹
- `image_progress`：更新 `ImageTask` 列表并按阶段去抖提示
- `workflow_complete`：确保最终内容/图片落到最后一条 assistant 消息

## 4. Message 渲染策略

**MessageTypeRenderer** 负责区分三类消息：
1. **用户消息**：右对齐 + HITL 响应胶囊
2. **HITL 提问**：左对齐气泡（非最后一条）
3. **assistant 消息**：
   - 有时间线输出 → `AgentTimelineView`
   - 只有纯文本 → Markdown 文本卡

关键逻辑：
- 当前流式消息优先使用 **liveEvents**
- 历史消息使用 **message.events**（保留执行轨迹）

## 5. 时间线构建（buildAgentTimeline）

`buildAgentTimeline` 做了三件事：
1. **筛选内部节点**：`supervisor` 与 `_tools` 节点不直接展示
2. **阶段分组**：按 `agent_start` + `supervisor_decision` 归并为 stage
3. **输出聚合**：Brief / Research / ImagePlan / Review 等产物统一卡片化

输出结果：
- `currentStage` / `historyStages`
- `finalContent`（只在 `workflow_complete` 后渲染）
- `isThinking`（supervisor 工作中时显示“思考中”）

## 6. 关键组件职责

- `AgentTimelineView`：时间线 + 进度条 + 折叠卡片
- `ContentCard`：文案 + 图片资产展示
- `ImagePlanCard`：图片规划解析展示
- `ToolEventList`：工具调用详情
- `AgentStatusCards`：Brief / Layout / Alignment / Quality 等状态卡
- `HITLMessage`：交互式确认与反馈输入

## 7. 新事件/新卡片的接入规则

1. 在 `useStreamProcessor.processStreamEvent` 添加事件处理逻辑
2. 在 `buildAgentTimeline` 增加事件 → 卡片映射
3. 在 `AgentTimelineView` 中为新类型添加渲染
4. 必要时更新 `MessageTypeRenderer` 的筛选规则

## 8. UI 截图说明（组件对应）

> 以下为推荐的“截图位”描述，便于后续补真实截图。

**截图 A：流式执行主视图（收起态）**
- 位置：对话区最新一条 assistant 消息
- 组件：`MessageTypeRenderer` + `AgentTimelineView`
- 关键元素：进度条、当前阶段、折叠后的执行轨迹摘要

**截图 B：执行轨迹展开态**
- 位置：点击“执行轨迹”标题展开
- 组件：`AgentTimelineView`
- 关键元素：阶段列表（已完成/进行中）、每阶段内的卡片（Brief/Research/ImagePlan/Quality）

**截图 C：HITL 提问 + 内容预览**
- 位置：HITL 中断时的对话区
- 组件：`InteractiveHITLBubble` / `HITLMessage`
- 关键元素：文案/图片规划预览、继续/重生成按钮、用户反馈输入框

**截图 D：最终内容卡片**
- 位置：`workflow_complete` 后
- 组件：`ContentCard`
- 关键元素：标题/正文/标签 + 图片资产缩略图

## 9. 状态流转图（UI 视角）

```
Idle
  | submit
  v
Streaming
  | ask_user
  v
Paused (HITL)
  | confirm
  v
Streaming
  | workflow_complete
  v
Completed
  | error/timeout
  v
Error
```

状态说明：
- **Idle**：未发起请求
- **Streaming**：SSE 正在推送，UI 持续更新
- **Paused**：收到 `workflow_paused`，等待用户确认
- **Completed**：收到 `workflow_complete` 且结束流
- **Error**：超时/网络错误/解析失败
