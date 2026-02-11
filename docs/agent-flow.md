# Agent Flow

## 运行生命周期

### 1. 请求进入

- 前端调用 `POST /api/agent/stream`
- 后端在 `src/pages/api/agent/stream.ts`：
  - 初始化 SSE 响应
  - 识别意图与内容类型
  - 初始化 `AgentState`
  - 启动 LangGraph 流
  - 进入单链路 V2 节点序列（详见 `docs/architecture.md`）

### 2. 流式执行

- `processAgentStream`（`src/server/agents/utils/streamProcessor.ts`）把图执行输出转为统一事件：
  - `agent_start` / `agent_end`
  - `message`
  - `tool_call` / `tool_result`
  - `supervisor_decision`
  - `ask_user` / `workflow_paused`
  - `content_update` / `image_progress` 等业务事件

### 3. 统一澄清与 HITL 中断

- `supervisor`/各关键节点基于 `requirementClarity` + `requestAgentClarification` 判断是否需要追问
- 已问过的问题记录在 `agentClarificationKeys`，避免重复追问
- 触发 `askUser` 后，LangGraph 发 `INTERRUPT`，并通过 SSE 推送：
  - `ask_user`
  - `workflow_paused`

- 中断：agent 内调用 `askUser` 工具触发 LangGraph `INTERRUPT`
- 恢复：前端提交 `/api/agent/confirm`
- 线程标识：`threadId`

### 4. Review 质量门禁与回流

- `review_agent` 输出 `reviewFeedback` 与 `qualityScores`
- 若“口头通过”但评分未达标，则按低分维度回流到指定节点重试
- `review_agent` 作为最终门禁，路由不允许跳过 review 回退到更早阶段

### 5. 结束与落库

- 流程完成后输出 `[DONE]`
- 内容/图片/事件落库并写入 Langfuse trace
- 如客户端中断，流程会尝试把当前 creative 标记为 `aborted`


## 澄清机制与 HITL

### 1. 为什么要做统一澄清

当用户输入过于宽泛时，直接生成会导致：
- 前期规划不足
- 内容命中率低
- 迭代次数增加

因此 V2 中将“是否追问”提升为统一能力，而不是 supervisor 单点能力。

### 2. 当前实现

#### supervisor 级澄清
- 基于 `requirementClarity` 判断需求是否缺失关键维度
- 满足条件时优先发起 `ask_user`

#### agent 级澄清
下列节点在关键输入不足时都会主动提问：
- `brief_compiler_agent`
- `research_evidence_agent`
- `reference_intelligence_agent`
- `writer_agent`
- `layout_planner_agent`
- `image_planner_agent`
- `image_agent`
- `review_agent`

### 3. 去重策略

- 每次澄清携带 `key`
- 已提过的问题记录在 `agentClarificationKeys`
- 同一 key 只问一次，避免循环追问

### 4. 验证脚本

- `npm run eval:clarification -- --baseUrl=http://localhost:3000`
- `npm run eval:agent-clarification`
- `npm run lint:supervisor-prompt`


## 调试手册

### 1. 最小验证顺序

1. `npm run build:server`
2. `npm run lint:supervisor-prompt`
3. `npm run eval:agent-clarification`
4. `npm run eval:clarification -- --baseUrl=http://localhost:3000`

### 2. 常见问题定位

#### 问题 A：supervisor 不提问直接执行
- 检查 `prompts/supervisor.yaml` 是否包含“低清晰度先澄清”规则
- 跑 `eval:clarification` 看澄清命中率

#### 问题 B：某个 agent 不提问
- 检查对应节点是否调用 `requestAgentClarification`
- 跑 `eval:agent-clarification` 看该节点是否 PASS

#### 问题 C：review 被错误跳过
- 检查 `router.ts` 的 `canUseLlmBacktrackRoute`
- 确认 deterministic route 为 `review_agent` 时未被 supervisor 回退

### 3. 调试输出建议

- 关注 `routeFromSupervisor` 日志：
  - 是否出现“忽略不安全 LLM 路由”
  - 是否出现“采用 supervisor 回退路由”
- 对问题 case 固化为脚本场景，防止回归。
