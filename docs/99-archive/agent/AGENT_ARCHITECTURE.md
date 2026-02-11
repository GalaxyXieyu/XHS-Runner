# XHS-Agent 系统架构文档

> 最后更新: 2025-01-19 | 状态: Phase 0-3 已完成, Phase 4 已完成 ✅

---

## 1. 系统概述

### 1.1 核心定位
XHS-Agent 是一个基于 **LangGraph** 的多 Agent 协作系统，用于自动生成小红书内容（文案 + 图片）。

### 1.2 技术栈
技术选型表已拆分到参考文档，便于独立维护：`docs/reference/tech-stack.md`

---

## 2. 架构图

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         前端 (React)                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │ AgentChat   │  │ HITL弹窗    │  │ TemplateSelector           │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────────┘  │
└─────────┼────────────────┼──────────────────────────────────────────┘
          │ SSE            │ POST
          ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API Layer (Next.js)                              │
│  ┌───────────────────┐  ┌─────────────────────────────────────────┐  │
│  │ /api/agent/stream │  │ /api/agent/confirm                      │  │
│  │  - SSE 流式响应    │  │  - approve/reject/modify               │  │
│  │  - 意图识别        │  │  - saveAsTemplate                      │  │
│  │  - HITL 中断处理   │  │  - userResponse                        │  │
│  └─────────┬─────────┘  └─────────────────────────────────────────┘  │
└───────────┼──────────────────────────────────────────────────────────┘
            │ LangGraph.stream()
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent Layer (LangGraph)                          │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                    StateGraph                                 │  │
│   │                                                              │  │
│   │    START                                                     │  │
│   │      │                                                       │  │
│   │      ▼                                                       │  │
│   │  ┌──────────┐  ┌────────────────┐  ┌─────────────────────┐   │  │
│   │  │supervisor│──▶│ supervisor    │──▶│ supervisor_route   │   │  │
│   │  │          │  │ _tools         │  │                     │   │  │
│   │  └────┬─────┘  └────────────────┘  └──────────┬──────────┘   │  │
│   │       │                                        │              │  │
│   │       │        ┌──────────────────────┐        │              │  │
│   │       │        │                      │◀───────┘              │  │
│   │       │        ▼                      │                       │  │
│   │       │  ┌─────────────┐    ┌────────┴────────┐              │  │
│   │       │  │ supervisor  │    │ routeFromSupervisor           │  │
│   │       │  │ _route      │    │                      │         │  │
│   │       │  └─────────────┘    └────────┬─────────┘         │  │
│   │       │                             │                   │  │
│   │       │     ┌───────────────────────┼───────────────┐   │  │
│   │       │     │                       │               │   │  │
│   │       │     ▼                       ▼               │   │  │
│   │       │  ┌──────────┐  ┌─────────┐  ┌───────────┐  │   │  │
│   │       │  │research_ │  │writer_  │  │style_ana- │  │   │  │
│   │       │  │agent     │  │agent    │  │lyzer_agent│  │   │  │
│   │       │  └────┬─────┘  └────┬────┘  └─────┬─────┘  │   │  │
│   │       │       │             │             │        │   │  │
│   │       │       │             │             │        │   │  │
│   │       │       ▼             │             ▼        │   │  │
│   │       │  ┌──────────┐       │       ┌──────────┐   │   │  │
│   │       │  │research_ │       │       │style_    │   │   │  │
│   │       │  │tools     │       │       │tools     │   │   │  │
│   │       │  └────┬─────┘       │       └────┬─────┘   │   │  │
│   │       │       │             │            │         │   │  │
│   │       │       ▼             │            ▼         │   │  │
│   │       │      END            │       ┌──────────┐   │   │  │
│   │       │                     │       │supervisor│   │   │  │
│   │       │                     │       │_with_style   │   │  │
│   │       │                     │       └────┬─────┘   │   │  │
│   │       │                     │            │         │   │  │
│   │       │                     │            ▼         │   │  │
│   │       │                     │           END        │   │  │
│   │       │                     │                       │   │  │
│   │       │                     │     ┌─────────────────┘   │  │
│   │       │                     │     │                     │  │
│   │       │                     │     ▼                     │  │
│   │       │                     │  ┌─────────────┐         │  │
│   │       │                     │  │image_plan-  │         │  │
│   │       │                     │  │ner_agent    │         │  │
│   │       │                     │  └──────┬──────┘         │  │
│   │       │                     │         │                │  │
│   │       │                     │         ▼                │  │
│   │       │                     │  ┌─────────────┐         │  │
│   │       │                     │  │image_agent  │         │  │
│   │       │                     │  └──────┬──────┘         │  │
│   │       │                     │         │                │  │
│   │       │                     │         ▼                │  │
│   │       │                     │  ┌─────────────┐         │  │
│   │       │                     │  │image_tools  │         │  │
│   │       │                     │  └──────┬──────┘         │  │
│   │       │                     │         │                │  │
│   │       │                     │         ▼                │  │
│   │       │                     │  ┌─────────────┐         │  │
│   │       │                     │  │review_agent │         │  │
│   │       │                     │  └──────┬──────┘         │  │
│   │       │                     │         │                │  │
│   │       │                     │         ▼                │  │
│   │       │                     │        END               │  │
│   │       │                     │                         │  │
│   └───────┼─────────────────────┼─────────────────────────┘  │  │
│           │                     │                             │  │
│           └─────────────────────┘                             │  │
│                         ▲                                     │  │
│                         │ interruptAfter                      │  │
│                         │ writer_agent & image_planner_agent  │  │
│                         │                                     │  │
│   ┌─────────────────────┴─────────────────────────────────────┐   │
│   │                    PostgresSaver                            │   │
│   │               (状态持久化 + 工作流恢复)                      │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户输入 (message + 参考图)
        │
        ▼
┌───────────────────┐
│  意图识别          │──▶ intent_detected (SSE)
│  detectIntent()   │
└─────────┬─────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Supervisor Agent (主管)                                       │
│  - 路由决策: 研究 → 写作 → 规划 → 图片 → 审核                   │
│  - 工具: managePrompt, recommendTemplates                     │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Research Agent (研究专家)                                     │
│  - 工具: searchNotes, analyzeTopTags, getTopTitles            │
│  - 输出: researchComplete = true                              │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Writer Agent (创作专家)                                       │
│  - 工具: askUser (HITL)                                       │
│  - 输出: title, body, tags                                    │
│  ⚠️ HITL 确认点 #1 (interruptAfter)                            │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Style Analyzer (风格分析, 可选)                               │
│  - 工具: analyzeReferenceImage                                │
│  - 输出: styleAnalysis (颜色、构图、光线、情绪)                 │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Image Planner Agent (图片规划专家)                            │
│  - 工具: askUser (HITL)                                       │
│  - 输出: imagePlans[] (序号、角色、描述、prompt)               │
│  ⚠️ HITL 确认点 #2 (interruptAfter)                            │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Image Agent (图片生成专家)                                    │
│  - 工具: generateImage, generateImageWithReference            │
│  - 输出: generatedImagePaths[], generatedImageCount           │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Review Agent (审核专家)                                       │
│  - 输入: 生成的图片 (多模态)                                    │
│  - 输出: reviewFeedback { approved, suggestions, targetAgent }│
│  - 循环: 未通过则回到对应 agent 重新生成 (maxIterations)       │
└─────────┬────────────────────────────────────────────────────┘
          │
          ▼
         END
```

---

## 3. Agent 详解

### 3.1 Agent 一览表

| Agent | 职责 | 工具 | Prompt 文件 |
|-------|------|------|------------|
| **supervisor** | 路由协调、状态管理 | managePrompt, recommendTemplates | `xhs-agent-supervisor` |
| **research_agent** | 搜索热门内容、分析趋势 | searchNotes, analyzeTopTags, getTopTitles, getTrendReport | `xhs-agent-research_agent` |
| **writer_agent** | 生成标题、正文、标签 | askUser | `xhs-agent-writer_agent` |
| **style_analyzer_agent** | 分析参考图风格 | analyzeReferenceImage | `xhs-agent-style_analyzer_agent` |
| **image_planner_agent** | 规划图片序列和 prompt | askUser | `xhs-agent-image_planner_agent` |
| **image_agent** | 调用生图 API | generateImage, generateImageWithReference | `xhs-agent-image_agent` |
| **review_agent** | 审核生成结果 (多模态 Vision) | 无 (直接读取图片) | `xhs-agent-review_agent` |

### 3.2 Supervisor (主管)

**职责**:
- 根据当前状态决定下一步执行哪个 agent
- 维护执行流程的一致性和完整性

**路由逻辑** (`routeFromSupervisor`):
```
优先级顺序:
1. 显式指令: "NEXT: xxx_agent" 或 "NEXT: END"
2. 状态驱动:
   - 有参考图 + 无风格分析 → style_analyzer_agent
   - 未研究 → research_agent
   - 未生成内容 → writer_agent
   - 无图片规划 → image_planner_agent
   - 未完成图片生成 → image_agent
   - 未审核 → review_agent
   - 审核未通过 + 未达上限 → reviewFeedback.targetAgent
   - 其他 → END
```

### 3.3 Writer Agent (创作专家)

**输出格式**:
```markdown
标题: <小红书风格标题>
标签: #标签1 #标签2 #标签3

<正文内容>
```

**状态更新**:
- `contentComplete = true`
- `currentAgent = "writer_agent"`

### 3.4 Image Planner Agent (图片规划专家)

**输出格式**:
```json
[
  {"sequence": 0, "role": "cover", "description": "封面图", "prompt": "..."},
  {"sequence": 1, "role": "detail", "description": "步骤图", "prompt": "..."},
  {"sequence": 2, "role": "result", "description": "效果图", "prompt": "..."}
]
```

**状态更新**:
- `imagePlans = [...]`
- `imagesComplete = false`
- `reviewFeedback = null`

### 3.5 Review Agent (审核专家)

**特点**:
- 使用 Vision Model (多模态 LLM)
- 直接读取本地图片文件进行审核

**输出格式**:
```json
{
  "approved": true | false,
  "suggestions": ["建议1", "建议2"],
  "targetAgent": "image_planner_agent" | "image_agent" | "writer_agent",
  "optimizedPrompts": ["优化后的prompt1", "优化后的prompt2"]
}
```

**重试逻辑**:
```
maxIterations = 3 (默认)
iterationCount++ (每次审核)
如果 !approved && iterationCount < maxIterations → 回到 targetAgent
否则 → END
```

---

## 4. 工具系统

### 4.1 工具分类

#### 研究工具 (`researchTools`)
| 工具名 | 输入 | 输出 | 用途 |
|-------|------|------|------|
| `searchNotes` | query, themeId, limit | 笔记列表 | 搜索已抓取的笔记 |
| `analyzeTopTags` | themeId, days | 热门标签 | 分析热门标签和权重 |
| `getTopTitles` | themeId, limit, sortBy | 爆款标题 | 获取高互动标题 |
| `getTrendReport` | themeId | 趋势报告 | AI 生成的今日 vs 昨日对比 |

#### 图片工具 (`imageTools`)
| 工具名 | 输入 | 输出 | 用途 |
|-------|------|------|------|
| `generateImage` | prompt, style | taskId | 基础生图 |
| `generateImageWithReference` | prompt, referenceImageUrl, sequence, role | taskId, imageSize | 参考图风格生图 |
| `saveImagePlan` | creativeId, plans | planIds | 保存图片规划到 DB |

#### 风格工具 (`styleTools`)
| 工具名 | 输入 | 输出 | 用途 |
|-------|------|------|------|
| `analyzeReferenceImage` | imageUrl | styleAnalysis | 提取视觉风格特征 |

#### 用户交互工具
| 工具名 | 输入 | 输出 | 用途 |
|-------|------|------|------|
| `askUser` | question, options, selectionType, contextJson | UserResponse | HITL 用户确认 |
| `managePrompt` | action, prompt, templateId... | 模板管理 | 动态调整 prompt |
| `recommendTemplates` | category, keywords | 模板推荐 | 基于意图推荐模板 |

### 4.2 askUser 工具 (HITL 核心)

```typescript
interface AskUserInterrupt {
  type: "ask_user";
  question: string;           // 向用户展示的问题
  options?: AskUserOption[];  // 可选列表 (可带图片)
  selectionType: "single" | "multiple" | "none";
  allowCustomInput: boolean;  // 是否允许"其他"输入
  context?: Record<string, unknown>;  // 附加数据
  timestamp: number;
}
```

**工作流程**:
```
1. Agent 调用 askUser({ question, options, ... })
2. interrupt() 暂停 LangGraph 工作流
3. SSE 发送 ask_user 事件给前端
4. 前端展示弹窗，等待用户选择
5. 用户提交后 POST /api/agent/confirm
6. resumeWorkflow() 恢复工作流，携带用户响应
```

---

## 5. HITL (Human-in-the-Loop)

### 5.1 配置方式

**启用条件**: `enableHITL: true` (前端传入)

**中断点**:
```typescript
// graphBuilder.ts
if (hitlConfig?.enableHITL) {
  return workflow.compile({
    checkpointer,
    interruptAfter: ["writer_agent", "image_planner_agent"], // 两个确认点
  });
}
```

### 5.2 确认流程

```
writer_agent 生成内容
        │
        ▼
   [interruptAfter]
        │
        ▼
┌───────────────────┐
│ stream.ts 检测到  │──▶ 发送 confirmation_required (SSE)
│ chunk 包含 INTERRUPT │──▶ 发送 workflow_paused (SSE)
└─────────┬─────────┘          res.end()
          │
          │ 用户操作
          ▼
┌───────────────────────────────────┐
│ POST /api/agent/confirm           │
│ { threadId, action, modifiedData, ││
│   userFeedback, saveAsTemplate }  │
└─────────┬─────────────────────────┘
          │
          ▼
┌───────────────────────────────────┐
│ resumeWorkflow(threadId, ...)     │
│  - approve: 继续执行              │
│  - reject: 携带 userFeedback 重试 │
│  - modify: 携带 modifiedData 继续 │
│  - saveAsTemplate: 保存后继续     │
└─────────┬─────────────────────────┘
          │
          ▼
   恢复 LangGraph 执行
```

### 5.3 支持的操作

| 操作 | 参数 | 效果 |
|-----|------|------|
| **approve** | 无 | 确认当前结果，继续执行 |
| **reject** | userFeedback | 拒绝并附带反馈重新生成 |
| **modify** | modifiedData | 修改后继续 (如编辑文案) |
| **saveAsTemplate** | { name, category } | 保存为模板后继续 |

---

## 6. 状态管理 (AgentState)

### 6.1 状态定义

```typescript
const AgentState = Annotation.Root({
  // 核心状态
  messages: BaseMessage[],
  currentAgent: AgentType,

  // 执行进度
  researchComplete: boolean,
  contentComplete: boolean,
  imagesComplete: boolean,

  // 数据传递
  referenceImageUrl: string | null,
  referenceImages: string[],
  styleAnalysis: StyleAnalysis | null,
  imagePlans: ImagePlan[],
  generatedImagePaths: string[],
  generatedImageCount: number,
  creativeId: number | null,

  // 审核反馈
  reviewFeedback: ReviewFeedback | null,
  iterationCount: number,
  maxIterations: number,

  // 配置
  imageGenProvider: string,

  // HITL 状态
  pendingConfirmation: PendingConfirmation | null,
  threadId: string,
  userFeedback: string | null,
  regenerationCount: number,
  maxRegenerations: number,

  // 上下文压缩
  summary: string,
});
```

### 6.2 状态持久化

**Checkpointer**: PostgresSaver (Postgres)

**存储表** (LangGraph 自动创建):
- `checkpoints` - 检查点主表
- `checkpoint_blobs` - 状态数据
- `checkpoint_writes` - 状态更新队列

---

## 7. SSE 事件协议

### 7.1 事件类型

| 事件名 | 数据结构 | 触发时机 |
|-------|---------|---------|
| `agent_start` | { agent, content, timestamp } | Agent 开始执行 |
| `agent_end` | { agent, content, timestamp } | Agent 完成 |
| `tool_call` | { agent, tool, content, timestamp } | 工具调用 |
| `tool_result` | { agent, tool, content, timestamp } | 工具返回 |
| `message` | { agent, content, timestamp } | 普通消息 |
| `intent_detected` | { intent, confidence, suggestedCategory, keywords, timestamp } | 意图识别完成 |
| `confirmation_required` | { confirmationType, data, threadId, timestamp } | 需要用户确认 |
| `workflow_paused` | { threadId, timestamp } | 工作流暂停 (HITL) |
| `ask_user` | { question, options, selectionType, allowCustomInput, threadId, timestamp } | 询问用户 |
| `[DONE]` | - | 流结束 |

---

## 8. 意图识别系统

### 8.1 支持的意图类型

| 意图 | 触发关键词 | 推荐模板分类 |
|-----|-----------|-------------|
| **create_content** | 写一篇、生成、创作、帮我写 | content_structure |
| **analyze_trend** | 趋势、热榜、分析 | writing_tone |
| **get_recommendation** | 推荐、有什么、建议 | image_style |
| **modify_existing** | 修改、改写、优化 | content_structure |
| **style_transfer** | 参考这个图、风格迁移 | image_style |

### 8.2 工作流程

```
用户输入
    │
    ▼
detectIntent(message) → { intent, confidence, suggestedCategory, keywords }
    │
    ├── confidence > 0.5 ──▶ 发送 intent_detected 事件 (SSE)
    │                         前端可显示模板推荐
    │
    └── 进入主 Agent 流程
```

---

## 9. 文件结构

```
src/server/agents/
├── multiAgentSystem.ts     # 主入口 (67行) ⚡
├── graph/
│   ├── index.ts
│   └── graphBuilder.ts     # StateGraph + interruptAfter (182行)
├── state/
│   ├── index.ts
│   └── agentState.ts       # 状态定义 (134行)
├── nodes/
│   ├── index.ts
│   ├── supervisorNode.ts   # 主管节点 (45行)
│   ├── researchNode.ts     # 研究节点 (32行)
│   ├── writerNode.ts       # 写作节点 (29行)
│   ├── styleAnalyzerNode.ts # 风格分析节点 (32行)
│   ├── imagePlannerNode.ts  # 图片规划节点 (70行)
│   ├── imageNode.ts         # 图片节点 (46行)
│   └── reviewNode.ts        # 审核节点 (71行)
├── routing/
│   ├── index.ts
│   └── router.ts           # 路由逻辑 (89行)
├── tools/
│   ├── index.ts            # 工具导出 (309行)
│   ├── researchTools.ts    # 研究工具
│   ├── imageTools.ts       # 图片工具
│   ├── askUserTool.ts      # HITL 确认工具 (94行)
│   ├── promptTools.ts      # Prompt 管理工具
│   └── intentTools.ts      # 意图识别工具
└── utils/
    ├── index.ts
    ├── messageUtils.ts      # 消息处理
    ├── configUtils.ts       # 配置工具
    └── contextUtils.ts      # 上下文压缩
```

---

## 10. 优化方向 (Phase 4 已完成 ✅)

### 10.1 已完成功能回顾

| Phase | 功能 | 状态 |
|-------|------|------|
| Phase 0 | 后端重构 (1122行 → 7个节点) | ✅ 完成 |
| Phase 0 | 前端重构 (HITL UI 组件) | ✅ 完成 |
| Phase 1 | HITL 实现 (2个中断点) | ✅ 完成 |
| Phase 2 | Prompt 工具化 (managePrompt) | ✅ 完成 |
| Phase 3 | 意图识别 + 模板推荐 | ✅ 完成 |
| Phase 4 | 并行执行优化 | ✅ 完成 |
| Phase 4 | Supervisor 自动优化 Prompt | ✅ 完成 |
| Phase 4 | 模板智能排序 | ✅ 完成 |

### 10.2 Phase 4 已实现功能

#### 10.2.1 并行执行优化 ✅ 已实现

**实现方式**: 使用 LangGraph `Send` API 实现真正的并行执行

**并行场景**:
```
有参考图时，research_agent + style_analyzer_agent 同时执行
```

**架构变更**:
```
┌─────────────────────────────────────────┐
│ parallel_prepare (判断并行条件)           │
└─────────────────┬───────────────────────┘
                  │
         ┌───────┴───────┐
         ▼               ▼
┌─────────────┐  ┌─────────────┐
│research_agent│  │style_ana-   │
│   (并行)     │  │lyzer_agent  │
└──────┬──────┘  └──────┬──────┘
       └───────┬───────┘
               ▼
┌─────────────────────────────────────────┐
│ parallel_collect (状态合并)              │
└─────────────────┬───────────────────────┘
                  ▼
             supervisor
```

**性能提升**:
- 预估节省 **30-50% 执行时间**
- 两个 LLM 调用同时进行

#### 10.2.2 Supervisor 自动优化 Prompt ✅ 已实现

**目标**: Supervisor 根据审核反馈自动调整 agent prompt，减少手动重试

**实现方式**:

1. **promptTools.ts** 新增 `optimize` action:
   ```typescript
   case "optimize":
     const optimizedPrompt = generateOptimizedPrompt(agentName, prompt, feedback);
     return { success: true, optimizedPrompt, ... };
   ```

2. **generateOptimizedPrompt** 辅助函数:
   - 基于 feedback 关键词生成优化建议
   - 支持多种反馈类型（太短/太长/风格/标题/标签/图片/颜色/构图）
   - 根据 agent 类型添加特定优化

3. **supervisorNode.ts** 传递优化信息:
   ```typescript
   const stateVariables = {
     needsOptimization: state.reviewFeedback && !state.reviewFeedback.approved ? "是" : "否",
     optimizationTarget: state.reviewFeedback?.targetAgent || "",
     optimizationSuggestions: state.reviewFeedback?.suggestions.join("\n") || "",
   };
   ```

**工作流程**:
```
审核不通过 → supervisor 接收 feedback → 调用 managePrompt.optimize →
生成优化后的 prompt → 用于下次重试
```

#### 10.2.3 模板智能排序 ✅ 已实现

**目标**: 基于历史成功率动态调整模板推荐优先级

**实现方式**:

1. **数据库 schema 变更** (`schema.ts`):
   ```typescript
   export const promptProfiles = pgTable('prompt_profiles', {
     // ... 原有字段
     successCount: integer('success_count').default(0),
     failCount: integer('fail_count').default(0),
     lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
   });
   ```

2. **promptTools.ts** 新增功能:
   - `recordUsage` action: 记录成功/失败
   - `successRateExpr`: 计算成功率的 SQL 表达式
   - `search` 和 `list` action 按成功率排序

3. **审核节点记录结果** (`reviewNode.ts`):
   ```typescript
   // 异步记录审核结果
   recordReviewResult(feedback.approved).catch(console.error);
   ```

**工作流程**:
```
模板应用 → 审核通过/不通过 → recordUsage → 更新 success_count/fail_count →
下次搜索/列出模板 → 按成功率排序
```

**排序逻辑**:
```sql
ORDER BY (success_count::float / NULLIF(success_count + fail_count, 0)) DESC,
         usage_count DESC
```

### 10.3 Phase 4 已全部完成 ✅

### 10.4 其他优化方向

| 优化项 | 描述 | 优先级 |
|-------|------|-------|
| **并行执行** | research + style 分析可并行 | P1 |
| **缓存层** | 热门内容缓存，减少重复调用 | P1 |
| **错误恢复** | 单 agent 失败时自动重试 | P2 |
| **成本优化** | 根据内容复杂度选择模型 | P2 |
| **多模态增强** | 图片描述 → 生成文案 | P3 |

---

## 11. 监控与可观测性

### 11.1 Langfuse 集成

```typescript
// 创建 trace
const trace = await createTrace('agent-stream', {
  message,
  themeId,
  hasReferenceImage,
});

// 记录 span (工具调用)
await logSpan({
  traceId,
  name: `tool:${tc.name}`,
  input: tc.args,
});

// 记录 generation (LLM 调用)
await logGeneration({
  traceId,
  name: nodeName,
  input: { agent: nodeName },
  output: msg.content,
});
```

### 11.2 关键指标

| 指标 | 采集点 | 告警阈值 |
|-----|-------|---------|
| 执行时长 | 整体 + 每个 agent | > 120s |
| 迭代次数 | reviewAgentNode | > 3 |
| 工具调用失败 | stream.ts error | > 1 |
| HITL 拒绝率 | confirm API | > 50% |

---

## 12. 常见问题 (FAQ)

### Q1: Agent 无响应怎么办?

```bash
# 检查 Langfuse trace
# 查看 Postgres checkpoints 表
SELECT * FROM checkpoints ORDER BY created_at DESC LIMIT 10;

# 检查工作流状态
SELECT * FROM job_executions WHERE status = 'running';
```

### Q2: 如何调试单个 Agent?

```typescript
// 在 stream.ts 中添加断点
if (nodeName === "writer_agent") {
  console.log("[DEBUG] Writer output:", JSON.stringify(output, null, 2));
}
```

### Q3: 如何添加新的 Agent?

1. 在 `nodes/` 创建新节点文件
2. 在 `tools/` 创建对应工具
3. 在 `router.ts` 添加路由逻辑
4. 在 `graphBuilder.ts` 添加节点和边
5. 在 Langfuse 创建对应 prompt

---

## 13. 参考资料

- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [Langfuse Prompt Management](https://langfuse.com/docs/prompts)
- [火山引擎即梦 API](https://www.volcengine.com/docs/6791/1365615)
