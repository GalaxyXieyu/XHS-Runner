# Agent 流程（单链路 V2）

本文件描述 **端到端 Agent 流程**、路由策略、事件协议与关键状态字段，是实现与排障的主入口。

## 1. 端到端流程概览

```
/api/agent/stream
  → supervisor 决策
  → brief_compiler → research_evidence → reference_intelligence
  → writer → layout_planner → image_planner → image → review
  → workflow_complete + [DONE]
```

## 2. 节点职责（按顺序）

- **supervisor**：路由决策、澄清判定、回流控制
- **brief_compiler_agent**：结构化 brief（受众/目标/约束/语气）
- **research_evidence_agent**：趋势/标题/标签证据补充
- **reference_intelligence_agent**：参考图语义/风格解析
- **writer_agent**：文案生成（title/body/tags）
- **layout_planner_agent**：版式结构规划
- **image_planner_agent**：图片规划 + 段落绑定
- **image_agent**：图片生成与资产落库
- **review_agent**：质量审核 + 评分维度回流

## 3. API 入口与生命周期

### 3.1 `/api/agent/stream`
- 建立 SSE 通道（`text/event-stream`）
- 初始化 `AgentState` + LangGraph
- 过程中持续推送事件（见第 6 节）

### 3.2 `/api/agent/confirm`
- HITL 中断恢复
- 支持 `approve / reject / modify`

### 3.3 流程结束
- `workflow_complete` 事件后输出 `[DONE]`
- 发生中断时尝试标记 creative 为 `aborted`

## 4. 路由与回流规则（router.ts 口径）

**确定性路由优先级最高**：
- 依赖 `AgentState` 的完成标记逐步推进
- `review_agent` 为最终质量门禁，不允许跳过

**LLM 回退路由（有限制）**：
- 仅允许回退或同阶段重跑
- 当状态机目标是 `review_agent` 时，LLM 只能选择 `review_agent`
- 达到 `maxIterations` 或出现严重错误时强制走确定性路径

**质量回流**：
- review “口头通过”但评分未达标时，按低分维度回流

## 5. 统一澄清与 HITL

### 5.1 需求澄清（requirementClarity）
- supervisor 与关键节点使用 `requirementClarity` 判定
- 低清晰度触发 `ask_user`
- 去重字段：`agentClarificationKeys`

### 5.2 HITL 触发点
- **writer_agent** 完成后：确认文案继续/重生成
- **image_planner_agent** 完成后：确认图片规划继续/重规划

`ask_user` 事件会携带：
- `question` / `options` / `selectionType` / `allowCustomInput`
- `context.__hitl` + `kind`（`content` 或 `image_plans`）
- `threadId`

## 6. SSE 事件协议（关键字段）

**生命周期**：
- `agent_start` / `agent_end`
- `workflow_complete`

**文本与工具**：
- `message`：`content`
- `progress`：`content`
- `tool_call` / `tool_result`
- `supervisor_decision`：`decision` / `reason`

**业务产物**：
- `content_update`：`title` / `body` / `tags`
- `image_prompt_ready`：出图前的最终 prompt 证据（应只含 `finalPromptHash` + `finalPromptPreview` + `finalPromptPath`；不要在事件里放全文）
- `image_progress`：`taskId` / `status` / `progress` / `url` / `errorMessage`
- `workflow_progress`：`phase` / `progress` / `currentAgent`
- `brief_ready` / `layout_spec_ready` / `alignment_map_ready`
- `quality_score`

**交互**：
- `ask_user`
- `workflow_paused`

**诊断/状态**：
- `state_update` / `intent_detected` / `content_type_detected`

### 6.1 事件字段示例 JSON

> SSE 发送格式为：`data: {JSON}\n\n`

**agent_start**
```json
{
  "type": "agent_start",
  "agent": "writer_agent",
  "content": "创作专家 开始工作...",
  "timestamp": 1710000000000
}
```

**message**
```json
{
  "type": "message",
  "agent": "writer_agent",
  "content": "标题：...\n\n正文：...",
  "timestamp": 1710000000123
}
```

**tool_call / tool_result**
```json
{
  "type": "tool_call",
  "agent": "research_evidence_agent",
  "tool": "searchNotes",
  "toolCallId": "searchNotes_1710000001",
  "toolInput": {"keyword": "春游"},
  "timestamp": 1710000000200
}
```
```json
{
  "type": "tool_result",
  "agent": "research_evidence_agent",
  "tool": "searchNotes",
  "toolCallId": "searchNotes_1710000001",
  "toolOutput": {"items": []},
  "timestamp": 1710000000800
}
```

**content_update**
```json
{
  "type": "content_update",
  "title": "春游小红书攻略",
  "body": "...",
  "tags": ["春游", "出游"],
  "timestamp": 1710000001000
}
```

**image_progress**
```json
{
  "type": "image_progress",
  "taskId": 1,
  "status": "generating",
  "progress": 0.6,
  "url": null,
  "errorMessage": null,
  "timestamp": 1710000002000
}
```

**ask_user + workflow_paused**
```json
{
  "type": "ask_user",
  "question": "文案已生成，是否继续？",
  "options": [{"id": "approve", "label": "继续"}, {"id": "reject", "label": "重生成"}],
  "selectionType": "single",
  "allowCustomInput": true,
  "context": {"__hitl": true, "kind": "content"},
  "threadId": "<thread-id>",
  "timestamp": 1710000003000
}
```
```json
{
  "type": "workflow_paused",
  "threadId": "<thread-id>",
  "content": "工作流已暂停，等待用户确认",
  "timestamp": 1710000003001
}
```

**workflow_complete**
```json
{
  "type": "workflow_complete",
  "title": "春游小红书攻略",
  "body": "...",
  "tags": ["春游", "出游"],
  "imageAssetIds": [101, 102, 103],
  "creativeId": 999,
  "timestamp": 1710000004000
}
```

### 6.2 时序图（SSE / HITL）

```
用户/前端         API(Next)              LangGraph/Agents           外部服务
  | POST /stream     |                            |                      |
  |----------------->| init SSE + AgentState      |                      |
  |<-- agent_start --|--------------------------->| supervisor           |
  |<-- message ------|<---------------------------| writer_agent         |
  |<-- content_update|<---------------------------| writer_agent         |
  |<-- ask_user -----|<---------------------------| writer_agent         |
  |<-- workflow_paused (暂停)                     |                      |
  | POST /confirm    |                            |                      |
  |----------------->| resume thread              |                      |
  |<-- image_progress|<---------------------------| image_agent          | image provider
  |<-- quality_score |<---------------------------| review_agent         |
  |<-- workflow_complete + [DONE]                 |                      |
```

## 7. AgentState 关键字段

**流程控制**：
- `currentAgent` / `iterationCount` / `maxIterations`
- `briefComplete` / `evidenceComplete` / `referenceIntelligenceComplete`
- `contentComplete` / `layoutComplete` / `imagesComplete`

**输入与上下文**：
- `messages` / `threadId`
- `referenceImageUrl` / `referenceImages` / `referenceInputs`
- `layoutPreference` / `contentType`

**中间产物**：
- `creativeBrief` / `evidencePack` / `referenceAnalyses`
- `layoutSpec` / `paragraphImageBindings` / `textOverlayPlan` / `imagePlans`

**结果与质量**：
- `generatedContent` / `generatedImagePaths` / `generatedImageAssetIds`
- `reviewFeedback` / `qualityScores`

**交互与异常**：
- `pendingConfirmation` / `agentClarificationKeys` / `lastError`

## 8. 工具调用清单（高频）

- **supervisor**：`managePrompt` / `recommendTemplates` / `askUser`
- **research_evidence_agent**：`searchNotes` / `analyzeTopTags` / `getTopTitles` / `getTrendReport` / `webSearch` / `askUser`
- **image_agent**：`generateImage` / `generate_with_reference` / `generate_images_batch`

> 以 `src/server/agents/tools/index.ts` 为准

## 9. 失败处理与收尾

- `lastError` 命中严重错误时进入兜底重跑路径
- `iterationCount >= maxIterations` 时终止流程
- 客户端中断时尝试把 creative 标记为 `aborted`

## 10. XHS 封面 Prompt 策略（业务口径 / Canonical）

> 目标：一次跑完即可交付的 XHS 封面，移动端可读性优先；策略落到最终 prompt（不做像素级合成）。
>
> 说明：`PLAN_REF_IMAGE_XHS.md` 为阶段性计划文档；当策略落地后，以本节 + source of truth 为准。

实现入口（source of truth）：
- `src/server/services/xhs/integration/referencePromptAugmentor.ts`

核心规则（必须满足）：
- **封面模板块**：最终 prompt 会注入 `XHS_COVER_TEMPLATE (3:4, mobile-first)`。
- **默认审美方向**：`editorial_magazine_cover` 为硬默认；仅当 reference / 语义明确是对比或清单时才切换 archetype。
- **层级与文字密度**：必须 1 个主标题（<=10 字）；可选 1 个副标题（<=16 字）；禁止段落小字/多文本块。
- **安全区**：关键文本/人脸/logo 保持在画面中心 ~80% 安全区，留足边距。
- **对比度保证**：背景可深/浅/渐变/纹理，但必须保证标题/logo 高对比；必要时使用文字背后的 overlay panel（纯色/渐变）兜底。
- **Logo / 品牌标识**：有 logo/content_ref 时，优先“放在主卡片内部”（inside-card），保持高对比、不可变形；避免 tiny corner badge。
- **Richness policy**："更丰富" 只能加 1 个 sticker/tag（<=6 字）+ 1 个 micro element（分割线/点阵/微型 icon row）；不能用加文案来堆信息密度。

标题渲染策略（优先级）：
- **Prompt-first**：封面图优先用 `TITLE_SPEC` 让模型原生渲染可读标题。
- **Title-card reference（可选）**：必要时可使用“最后一张 reference 作为排版锚点”的方案（以 `PLAN_REF_IMAGE_XHS.md` 为历史背景；行为以代码为准）。

可观测证据（用于迭代与回归，不贴全文 prompt）：
- `image_prompt_ready`：出图前的最终 prompt 证据，只包含 `finalPromptHash` + `finalPromptPreview` + `finalPromptPath`。
- Harness 产物：`run-evidence.json (v2)` + `prompts/*.prompt.txt` 用于 diff 与审计。
