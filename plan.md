# Agent 系统优化方案 - 最终版

## 实施进度

| Phase | 状态 | 完成日期 |
|-------|------|----------|
| Phase 0: 后端重构 | ✅ 完成 | 2025-01-19 |
| Phase 0: 前端重构 | ✅ 完成 | 2025-01-19 |
| Phase 1: HITL 实现 | ✅ 完成 | 2025-01-19 |
| Phase 2: Prompt 工具化 | ✅ 完成 | 2025-01-19 |
| Phase 3: 意图识别 | ✅ 完成 | 2025-01-19 |
| Phase 4: 智能优化 | 🔲 待开始 | - |

---

## 用户确认的需求

| 决策项 | 选择 |
|-------|------|
| HITL 确认点 | `image_planner` + `writer_agent` 后 |
| 模板分类 | 全部支持 (`image_style`, `writing_tone`, `content_structure`) |
| 状态持久化 | 数据库 (PostgresSaver) |
| 优先实现 | Phase 0 (重构) → Phase 1 (HITL) |

---

## Phase 0: 代码重构（先决条件）✅ 已完成

### 0.1 重构前代码问题

| 文件 | 重构前行数 | 重构后行数 | 状态 |
|-----|-----------|-----------|------|
| `multiAgentSystem.ts` | 1122 | 67 | ✅ 已拆分 |
| `GenerationSection.tsx` | 921 | 921 | ⏸️ 保持（功能正常） |
| `AgentCreator.tsx` | 883 | 883 | ⏸️ 保持（功能正常） |
| `SettingsTab.tsx` | 1194 | 1194 | ⏸️ 保持（功能正常） |

### 0.2 后端重构方案 ✅ 已完成

**目标**: `multiAgentSystem.ts` 从 1122 行拆分为多个模块

**实际拆分结果**:
```
src/server/agents/
├── multiAgentSystem.ts         # 主入口 (67行) ✅
├── state/
│   └── agentState.ts           # 状态定义 ✅
├── tools/
│   ├── index.ts                # 工具导出 ✅
│   ├── researchTools.ts        # 研究工具 ✅
│   ├── imageTools.ts           # 图片工具 ✅
│   ├── askUserTool.ts          # 用户交互工具 ✅
│   ├── intentTools.ts          # 意图工具 ✅
│   └── promptTools.ts          # Prompt 工具 ✅
├── nodes/
│   ├── index.ts                # 节点导出 ✅
│   ├── supervisorNode.ts       # 主管节点 (40行) ✅
│   ├── researchNode.ts         # 研究节点 (32行) ✅
│   ├── writerNode.ts           # 写作节点 (29行) ✅
│   ├── styleAnalyzerNode.ts    # 风格分析节点 (32行) ✅
│   ├── imagePlannerNode.ts     # 图片规划节点 (70行) ✅
│   ├── imageNode.ts            # 图片生成节点 (46行) ✅
│   └── reviewNode.ts           # 审核节点 (71行) ✅
├── routing/
│   ├── index.ts                # 路由导出 ✅
│   └── router.ts               # 路由逻辑 (89行) ✅
├── graph/
│   ├── index.ts                # 图导出 ✅
│   └── graphBuilder.ts         # StateGraph 构建 (182行) ✅
└── utils/
    ├── index.ts                # 工具导出 ✅
    ├── messageUtils.ts         # 消息处理 (41行) ✅
    ├── configUtils.ts          # 配置工具 (73行) ✅
    └── contextUtils.ts         # 上下文压缩 (68行) ✅
```

**拆分收益**:
- 单文件从 1122 行 → 主入口 100 行 + 7 个节点文件 (平均 70 行)
- 每个节点可独立测试
- 新增 HITL 功能只需修改对应节点

### 0.3 前端重构方案 ✅ 已完成

**实际实现结果**:
```
src/features/workspace/
├── components/
│   ├── hitl/
│   │   └── HITLConfirmDialog.tsx   # HITL 确认弹窗 (256行) ✅
│   ├── AskUserDialog.tsx           # 用户交互弹窗 ✅
│   └── TemplateSelector.tsx        # 模板选择器 ✅
└── hooks/
    ├── useAgentConfirm.ts          # HITL 确认逻辑 (82行) ✅
    └── useTemplates.ts             # 模板管理 (79行) ✅

src/components/ui/                   # 通用 UI 组件库 ✅
├── dialog.tsx                       # 模态框
├── progress.tsx                     # 进度条
├── badge.tsx                        # 状态标签
├── form.tsx                         # 表单组件
└── ... (47个组件)
```

### 0.4 重构执行步骤 ✅ 已完成

| Step | 任务 | 状态 |
|------|------|------|
| Step 1 | 后端工具层拆分 | ✅ 完成 |
| Step 2 | 后端节点层拆分 | ✅ 完成 |
| Step 3 | 后端路由和图构建拆分 | ✅ 完成 |
| Step 4 | 前端通用组件 | ✅ 已有 UI 库 |
| Step 5 | 前端 HITL 组件 | ✅ 完成 |

---

## Phase 1: 基础 HITL 实现方案 ✅ 已完成

### 1.1 LangGraph Interrupt 配置 ✅ 已实现

**文件**: `src/server/agents/graph/graphBuilder.ts`

```typescript
// 实际实现
if (hitlConfig?.enableHITL) {
  const checkpointer = await getCheckpointer();
  return workflow.compile({
    checkpointer,
    interruptAfter: ["writer_agent", "image_planner_agent"],
  });
}
```

### 1.2 AgentState 字段 ✅ 已实现

**文件**: `src/server/agents/state/agentState.ts`

已包含 HITL 相关字段：
- `pendingConfirmation` - 待确认数据
- `threadId` - 线程 ID
- `userFeedback` - 用户反馈
- `regenerationCount` - 重试次数

### 1.3 SSE 事件扩展 ✅ 已实现

**文件**: `src/pages/api/agent/stream.ts`

已实现事件类型：
- `confirmation_required` - 需要用户确认
- `workflow_paused` - 工作流暂停
- `ask_user` - 询问用户（askUser 工具）

### 1.4 确认 API ✅ 已实现

**文件**: `src/pages/api/agent/confirm.ts` (116行)

已实现功能：
- `approve` - 批准继续
- `reject` - 拒绝并带反馈重新生成
- `modify` - 修改后继续
- `saveAsTemplate` - 保存为模板
- `userResponse` - askUser 工具响应

### 1.5-1.8 前端实现 ✅ 已完成

**已实现文件**:
- `src/features/workspace/components/hitl/HITLConfirmDialog.tsx` (256行)
- `src/features/workspace/hooks/useAgentConfirm.ts` (82行)
- `src/features/workspace/hooks/useTemplates.ts` (79行)
- `src/pages/api/templates/index.ts` (107行)
- `src/pages/api/templates/[id].ts` (68行)
- `src/pages/api/templates/recommend.ts` (56行)

---

## Phase 2: Prompt 工具化 ✅ 已完成

### 2.1 实现概述

**已完成功能**:
- `managePromptTool` 工具已实现 (src/server/agents/tools/promptTools.ts)
- Supervisor 已绑定 `managePromptTool` (src/server/agents/nodes/supervisorNode.ts)
- Graph 已添加 `supervisor_tools` 节点和条件边 (src/server/agents/graph/graphBuilder.ts)
- 路由函数 `shouldContinueSupervisor` 已实现 (src/server/agents/routing/router.ts)

**工具功能**:
- `modify`: 修改当前 agent 的 prompt
- `save`: 保存为模板
- `search`: 搜索模板
- `apply`: 应用模板
- `list`: 列出所有模板

**架构变更**:
```
supervisor → shouldContinueSupervisor → supervisor_tools (如有工具调用)
                                      → supervisor_route → routeFromSupervisor → 各 agent
```

### 2.2 工具设计 (已实现)

```typescript
// tools/promptTools.ts
const promptTool = tool(
  async ({
    action,
    // 通用参数
    agentName,
    prompt,
    // 模板相关参数
    templateId,
    templateName,
    category,
    tags,
    // 搜索参数
    query,
  }: {
    action: 'modify' | 'save' | 'search' | 'apply' | 'list';
    agentName?: string;
    prompt?: string;
    templateId?: number;
    templateName?: string;
    category?: 'image_style' | 'writing_tone' | 'content_structure';
    tags?: string[];
    query?: string;
  }) => {
    switch (action) {
      case 'modify':
        // 修改当前 agent 的 prompt
        return { success: true, agentName, newPrompt: prompt };

      case 'save':
        // 保存为模板
        const result = await db.insert(schema.promptProfiles).values({
          name: templateName,
          category,
          systemPrompt: prompt,
          tags: tags?.join(','),
          isTemplate: true,
        });
        return { success: true, templateId: result.id };

      case 'search':
        // 搜索模板
        const templates = await db.select()
          .from(schema.promptProfiles)
          .where(and(
            eq(schema.promptProfiles.isTemplate, true),
            query ? ilike(schema.promptProfiles.name, `%${query}%`) : undefined,
            category ? eq(schema.promptProfiles.category, category) : undefined
          ));
        return { templates };

      case 'apply':
        // 应用模板
        const template = await db.select()
          .from(schema.promptProfiles)
          .where(eq(schema.promptProfiles.id, templateId!))
          .limit(1);
        // 更新使用次数
        await db.update(schema.promptProfiles)
          .set({ usageCount: sql`usage_count + 1` })
          .where(eq(schema.promptProfiles.id, templateId!));
        return { prompt: template[0]?.systemPrompt, applied: true };

      case 'list':
        // 列出所有模板
        const all = await db.select()
          .from(schema.promptProfiles)
          .where(eq(schema.promptProfiles.isTemplate, true))
          .orderBy(desc(schema.promptProfiles.usageCount));
        return { templates: all };
    }
  },
  {
    name: 'managePrompt',
    description: '统一的 Prompt 管理工具：修改当前 prompt、保存/搜索/应用模板',
    schema: z.object({
      action: z.enum(['modify', 'save', 'search', 'apply', 'list']),
      agentName: z.string().optional(),
      prompt: z.string().optional(),
      templateId: z.number().optional(),
      templateName: z.string().optional(),
      category: z.enum(['image_style', 'writing_tone', 'content_structure']).optional(),
      tags: z.array(z.string()).optional(),
      query: z.string().optional(),
    }),
  }
);
```

### 工具调用示例

```typescript
// 修改 prompt
await managePrompt({ action: 'modify', agentName: 'image_planner', prompt: '新的 prompt...' });

// 保存为模板
await managePrompt({ action: 'save', templateName: '清新风格', category: 'image_style', prompt: '...' });

// 搜索模板
await managePrompt({ action: 'search', query: '清新', category: 'image_style' });

// 应用模板
await managePrompt({ action: 'apply', templateId: 123 });

// 列出所有模板
await managePrompt({ action: 'list', category: 'image_style' });
```

**文件**: `src/server/db/migrations/xxx_add_hitl_tables.sql`

```sql
-- LangGraph checkpoint 表 (PostgresSaver 自动创建)
-- 但需要扩展 prompt_profiles 表

ALTER TABLE prompt_profiles
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS tags TEXT,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
```

### 1.7 前端确认 UI（支持反馈重试）

**文件**: `src/features/workspace/components/PromptConfirmDialog.tsx` (新建)

```tsx
interface PromptConfirmDialogProps {
  type: 'image_plans' | 'content';
  data: ImagePlan[] | WriterContent;
  threadId: string;
  onConfirm: (action: 'approve' | 'modify' | 'reject', data: any, options?: {
    userFeedback?: string;
    saveAsTemplate?: { name: string; category: string };
  }) => void;
  onCancel: () => void;
}

export function PromptConfirmDialog({ type, data, threadId, onConfirm, onCancel }: Props) {
  const [editedData, setEditedData] = useState(data);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  return (
    <Dialog open>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {type === 'image_plans' ? '确认图片生成方案' : '确认文案内容'}
          </DialogTitle>
        </DialogHeader>

        {/* 内容编辑区 */}
        {type === 'image_plans' ? (
          <ImagePlanEditor plans={editedData} onChange={setEditedData} />
        ) : (
          <ContentEditor content={editedData} onChange={setEditedData} />
        )}

        {/* 反馈输入区（点击"不满意"后显示） */}
        {showFeedback && (
          <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
            <Label>请描述您的修改意见：</Label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="例如：图片风格太暗了，我想要明亮清新的感觉..."
              className="mt-2"
            />
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFeedback(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => onConfirm('reject', editedData, { userFeedback: feedback })}
                disabled={!feedback.trim()}
              >
                提交反馈并重新生成
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            取消流程
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowFeedback(true)}
            className="text-orange-600"
          >
            😕 不满意，重新生成
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowSaveTemplate(true)}
          >
            💾 保存为模板
          </Button>
          <Button onClick={() => onConfirm('approve', editedData)}>
            ✅ 确认继续
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* 保存模板弹窗 */}
      <SaveTemplateDialog
        open={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        onSave={(name, category) => {
          onConfirm('approve', editedData, {
            saveAsTemplate: { name, category }
          });
        }}
      />
    </Dialog>
  );
}
```

### 1.8 前端处理 SSE 事件

**文件**: `src/features/workspace/components/AgentChat.tsx` (修改)

```tsx
// 处理 SSE 事件
const handleSSEEvent = (event: AgentEvent) => {
  switch (event.type) {
    case 'confirmation_required':
      // 显示确认弹窗
      setConfirmationDialog({
        type: event.confirmationType,
        data: event.data,
        threadId: event.threadId,
      });
      break;

    case 'workflow_paused':
      // 显示暂停状态
      setWorkflowStatus('paused');
      break;

    // ... 其他事件处理
  }
};

// 处理用户确认
const handleConfirm = async (
  action: 'approve' | 'modify' | 'reject',
  data: any,
  options?: { userFeedback?: string; saveAsTemplate?: any }
) => {
  setConfirmationDialog(null);

  const response = await fetch('/api/agent/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId: confirmationDialog.threadId,
      action,
      modifiedData: data,
      userFeedback: options?.userFeedback,
      saveAsTemplate: options?.saveAsTemplate,
    }),
  });

  if (action === 'reject') {
    // 重新生成，继续监听 SSE
    startSSEStream(confirmationDialog.threadId);
  } else if (response.ok) {
    // 继续执行，监听后续 SSE
    startSSEStream(confirmationDialog.threadId);
  }
};
```

---

## 执行流程图 ✅ 已实现

```
用户请求 → supervisor
    │
    ▼
research_agent → 研究完成
    │
    ▼
writer_agent → 生成文案
    │
    ▼
┌─────────────────────────────────┐
│  HITL 确认点 #1 (interruptAfter) │ ✅
│  - 展示生成的标题/正文/标签       │
│  - 用户可编辑                    │
│  - [确认] [保存为模板] [取消]    │
└─────────────────────────────────┘
    │ (用户确认后恢复)
    ▼
style_analyzer (可选) → image_planner
    │
    ▼
┌─────────────────────────────────┐
│  HITL 确认点 #2 (interruptAfter) │ ✅
│  - 展示图片规划和 prompt         │
│  - 用户可编辑每个 prompt         │
│  - [确认] [保存为模板] [取消]    │
└─────────────────────────────────┘
    │ (用户确认后恢复)
    ▼
image_agent → 生成图片
    │
    ▼
review_agent → 审核
    │
    ▼
END
```

---

## 关键文件清单 ✅ 已完成

| 文件 | 状态 | 说明 |
|-----|------|------|
| `src/server/agents/multiAgentSystem.ts` | ✅ | 主入口 (67行) |
| `src/server/agents/graph/graphBuilder.ts` | ✅ | interrupt 配置、PostgresSaver |
| `src/pages/api/agent/stream.ts` | ✅ | 处理暂停事件、发送 confirmation_required |
| `src/pages/api/agent/confirm.ts` | ✅ | 确认/恢复 API |
| `src/features/workspace/components/hitl/HITLConfirmDialog.tsx` | ✅ | 确认 UI (含编辑器) |
| `src/features/workspace/hooks/useAgentConfirm.ts` | ✅ | HITL 确认逻辑 |
| `src/features/workspace/hooks/useTemplates.ts` | ✅ | 模板管理 |
| `src/pages/api/templates/*.ts` | ✅ | 模板 API |

---

## 后续 Phase 概览

**Phase 2: Prompt 工具化** ✅ 已完成
- `managePromptTool` 已绑定到 Supervisor
- 支持动态调整 prompt

**Phase 3: 意图识别 + 模板系统** ✅ 已完成
- `detectIntent` 函数识别用户意图（5种意图类型）
- `recommendTemplatesTool` 已绑定到 Supervisor
- 工作流开始时自动发送 `intent_detected` 事件
- 模板选择 UI（TemplateSelector.tsx）已就绪

**已实现文件**:
- `src/server/agents/tools/intentTools.ts` - 意图识别和模板推荐
- `src/features/workspace/components/TemplateSelector.tsx` - 模板选择 UI
- `src/pages/api/agent/stream.ts` - 添加意图检测事件

**Phase 4: 智能优化** 🔲 待开始
- Supervisor 自动优化 prompt
- 基于 review 反馈的模板改进
