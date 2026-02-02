# XHS Agent 生成小红书业务流程（详细版）

本文先完整描述业务流程与关键决策点，再给出接口与代码实现映射。接口参数、状态字段、事件枚举等高频变动内容放在 `docs/reference/` 里，避免主文档堆叠。

## 0. 阅读顺序

- 先看第 2-6 章：理解端到端业务流程
- 再看第 7 章：接口与实现映射
- 细节查 `docs/reference/`：API、状态字段、事件与工具清单

## 1. 业务边界与术语

系统目标是把用户输入转为可发布的小红书内容（文案 + 图片），并提供可观察、可干预的生成过程。

**核心术语**：
- `creative`：一次内容生成的业务主记录（标题/正文/标签/状态）
- `asset`：图片资产记录（生成结果与元数据）
- `HITL`：Human-In-The-Loop，人为确认/修改/拒绝
- `AgentState`：LangGraph 运行中的状态聚合
- `SSE`：流式事件通道，前端实时呈现进度

## 2. 端到端流程概览（非 HITL）

**请求阶段**：
1. 接收用户输入与参考图，建立 SSE 通道
2. 意图识别与内容类型判定
3. 预创建 `creative`（如有 `themeId`）
4. 初始化 LangGraph 状态并开始流式执行

**生成阶段**：
5. `research_agent` 补充内容参考
6. `writer_agent` 生成文案并落库
7. `style_analyzer_agent`（可选）分析参考图风格
8. `image_planner_agent` 生成图片规划
9. `image_agent` 生成图片并写入资产/关联
10. `review_agent` 审核通过即结束，输出 `[DONE]`

## 3. 详细流程拆解

### 3.1 请求接入与会话建立

系统通过 `/api/agent/stream` 接收请求并建立 SSE 通道，保证前端能够实时显示“当前 agent、进度与中断状态”。

**关键行为**：
- 创建 SSE 响应头并持续 `res.write`
- 初始化轨迹记录与 Langfuse trace
- 根据 `enableHITL` 生成 `threadId`
- 预创建 `creative`，保证后续图片有统一归属

### 3.2 意图识别与内容类型判定

在正式进入生成流程前，系统先做轻量意图识别与内容类型判定，确保后续 prompt 与模板选择更贴合目标场景。

**结果影响**：
- 触发 `intent_detected` 与 `content_type_detected` 事件
- `contentType` 写入 `AgentState`，影响图片模板与提示词

### 3.3 初始化 LangGraph 状态

初始化状态会把“用户输入 + 参考图 + 生成配置”整合成统一的 `AgentState`，这是后续所有 agent 决策与执行的依据。

**初始化要点**：
- `messages` 作为主对话上下文
- `referenceImages` / `referenceImageUrl` 兼容单图与多图
- `imageGenProvider` 绑定生图服务商
- `creativeId` 保持落库一致性

### 3.4 Supervisor 决策与路由

`supervisor` 负责判断下一步由谁执行。既可以根据 prompt 输出 `NEXT:` 指令，也可以使用默认路由规则保证流程走完。

**决策输入**：
- 是否完成研究、文案、规划、图片
- 是否已有风格分析、审核结果
- 迭代次数与审核反馈

### 3.5 Research（研究补充）

`research_agent` 负责补充趋势、标题与热点参考信息，提升内容相关性与可读性。

**关键产物**：
- 研究结果写入对话消息
- `researchComplete = true`

### 3.6 Writer（文案生成）

`writer_agent` 生成标题/正文/标签。系统解析输出后落库，并将内容更新通过 SSE 事件同步给前端。

**关键产物**：
- 文案结构化解析（JSON 或纯文本）
- 更新 `creative` 标题/正文/标签
- 发送 `content_update` 与 `message` 事件

### 3.7 Style Analyzer（参考图风格）

如用户提供参考图，`style_analyzer_agent` 会抽取风格特征（色板/构图/氛围/光线），用于后续图片规划。

**关键产物**：
- `styleAnalysis` 写入状态
- 为图片规划提供风格输入

### 3.8 Image Planner（图片规划）

`image_planner_agent` 根据内容类型模板与风格分析生成图片规划，包括每张图的角色、描述与 prompt。

**关键产物**：
- `imagePlans` 写入状态
- HITL 启用时可进入“图片规划确认”

### 3.9 Image Agent（图片生成）

`image_agent` 负责实际生成图片、落库并建立资产关联。若参考图为 base64，先上传为 URL，再调用生图服务。

**关键产物**：
- 生成图片并写入 `assets`
- `creative_assets` 建立关联
- `generatedImagePaths / generatedImageAssetIds` 更新

### 3.10 Review（审核与反馈）

`review_agent` 读取最近生成图片进行多模态审核。通过则结束流程，未通过则给出建议并进入下一轮决策。

**关键产物**：
- `reviewFeedback` 写入状态
- 审核通过直接 END

### 3.11 结束与收尾

流程结束后输出 `[DONE]`，并统一 flush Langfuse 追踪记录。若发生异常则输出错误消息并结束 SSE。

## 4. HITL 与 askUser 详细流程

### 4.1 askUser 中断

`askUser` 工具触发 LangGraph `INTERRUPT`，前端收到 `ask_user` 与 `workflow_paused` 事件后提示用户输入，再通过 `/api/agent/confirm` 恢复执行。

### 4.2 内容确认（writer 后）

当 `writer_agent` 完成且启用 HITL 时，系统发送 `confirmation_required (content)`，用户可批准/修改/拒绝后继续流程。

### 4.3 图片规划确认（planner 后）

当 `image_planner_agent` 完成且启用 HITL 时，系统发送 `confirmation_required (image_plans)`，用户确认后进入生图阶段。

## 5. 数据落库与可观测性

- `creative`：保存标题/正文/标签与状态
- `assets`：保存图片二进制与元数据
- `creative_assets`：建立内容与资产关联
- Langfuse：trace/span/generation 全链路追踪
- Traj：记录多 Agent 执行轨迹

## 6. 失败处理与迭代控制

- 审核未通过进入下一轮，由 supervisor 决策再生成
- 达到 `maxIterations` 后终止流程
- 图片生成部分失败会记录结果，不阻断事件输出
- API 异常返回错误消息并结束 SSE

## 7. 接口与实现映射（从上到下）

### 7.1 API 入口
- `/api/agent/stream` → `src/pages/api/agent/stream.ts`
- `/api/agent/confirm` → `src/pages/api/agent/confirm.ts`

### 7.2 LangGraph 构建与路由
- Graph 构建 → `src/server/agents/graph/graphBuilder.ts`
- 路由规则 → `src/server/agents/routing/router.ts`
- 系统入口 → `src/server/agents/multiAgentSystem.ts`

### 7.3 Agent 节点实现
- `supervisorNode` → `src/server/agents/nodes/supervisorNode.ts`
- `researchAgentNode` → `src/server/agents/nodes/researchNode.ts`
- `writerAgentNode` → `src/server/agents/nodes/writerNode.ts`
- `styleAnalyzerNode` → `src/server/agents/nodes/styleAnalyzerNode.ts`
- `imagePlannerNode` → `src/server/agents/nodes/imagePlannerNode.ts`
- `imageAgentNode` → `src/server/agents/nodes/imageNode.ts`
- `reviewAgentNode` → `src/server/agents/nodes/reviewNode.ts`

### 7.4 状态与事件
- `AgentState`/`AgentEvent` → `src/server/agents/state/agentState.ts`
- 流式事件处理 → `src/server/agents/utils/streamProcessor.ts`

### 7.5 工具与外部服务
- 工具集合 → `src/server/agents/tools/index.ts`
- `askUser` → `src/server/agents/tools/askUserTool.ts`
- 意图识别 → `src/server/agents/tools/intentTools.ts`
- 提示词管理 → `src/server/agents/tools/promptTools.ts`
- 图片生成与资产 → `src/server/services/xhs/integration/imageProvider.ts`、`src/server/services/xhs/integration/assetStore.ts`

### 7.6 落库与配置
- `creative` 读写 → `src/server/services/xhs/data/creativeService.ts`
- Prompt 拉取 → `src/server/services/promptManager.ts`
- 内容类型模板 → `src/server/services/contentTypeTemplateManager.ts`
- Langfuse 追踪 → `src/server/services/langfuseService.ts`

## 8. 参考文档

- `docs/reference/api-index.md`
- `docs/reference/agent-state.md`
- `docs/reference/sse-events.md`
- `docs/reference/tools-catalog.md`
- `docs/reference/tech-stack.md`
