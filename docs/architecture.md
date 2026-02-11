# Architecture

## 单链路 Agent V2 架构

### 1. 设计原则

- **单链路**：只有一条主执行链，减少“分叉 + 兼容分支”带来的不确定性。
- **状态驱动**：路由默认由 `AgentState` 决定，`supervisor` 的 `NEXT:` 只允许安全回退。
- **可追问**：每个关键 agent 在输入不足时优先 `ask_user`。
- **可观测**：每个节点输出统一转为 SSE 事件，支持前端实时渲染与回放。

### 2. 节点序列

1. `supervisor`
2. `brief_compiler_agent`
3. `research_evidence_agent`
4. `reference_intelligence_agent`
5. `writer_agent`
6. `layout_planner_agent`
7. `image_planner_agent`
8. `image_agent`
9. `review_agent`

### 3. 路由规则（实现口径）

- 主路由入口：`src/server/agents/routing/router.ts`
- 图构建入口：`src/server/agents/graph/graphBuilder.ts`
- 当状态机目标是 `review_agent` 时，不允许 supervisor 跳过 review 回退到更早阶段（review 作为质量门禁）。

### 4. 统一澄清机制

- 公共工具：`src/server/agents/utils/agentClarification.ts`
- 需求清晰度分析：`src/server/agents/utils/requirementClarity.ts`
- supervisor 与各 agent 都可触发 `ask_user`，上下文通过 `context.__agent_clarification` 标识。

### 5. Prompt 管理

- Prompt 源：`prompts/*.yaml`
- 同步脚本：`scripts/sync-prompts-to-langfuse.ts`
- 当前只同步单链路核心 prompt（不含已下线链路）。


## Langfuse Dataset Pipeline

### 目标

建立“执行数据 -> 评估 -> Prompt 迭代”的闭环，并与单链路 Agent V2 对齐。

### Dataset 命名

每个节点一个 Dataset：`xhs-dataset-{agent}`

核心列表：
- `supervisor`
- `supervisor_route`
- `brief_compiler_agent`
- `research_evidence_agent`
- `reference_intelligence_agent`
- `layout_planner_agent`
- `writer_agent`
- `image_planner_agent`
- `image_agent`
- `review_agent`

### 数据来源

- 主链路执行事件来自：`/api/agent/stream`
- 统一事件转换来自：`src/server/agents/utils/streamProcessor.ts`
- Dataset 写入能力：`src/server/services/langfuseService.ts`

### 建议流程

1. 运行任务并自动记录 agent 输入/输出
2. 在 Langfuse 对样本打分（可读性、准确性、平台匹配）
3. 导出高质量样本，反哺 Prompt
4. 使用评估脚本回归验证：
   - `npm run eval:clarification`
   - `npm run eval:agent-clarification`


## 统一后台任务架构设计

### 核心理念

**所有 Agent 执行都是后台任务**，前端只负责：
1. 提交任务 → 立即返回 taskId
2. 订阅事件 → SSE 实时获取进度
3. 响应 HITL → 用户确认后继续

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端                                  │
│  POST /api/tasks          → 提交任务，返回 taskId            │
│  GET  /api/tasks/:id/events → SSE 订阅（支持断线重连）       │
│  POST /api/tasks/:id/respond → HITL 响应                    │
│  GET  /api/tasks/:id      → 查询状态                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    TaskManager 服务                          │
│  - 任务提交 & 状态管理                                       │
│  - 事件持久化（PostgreSQL）                                  │
│  - 实时广播（Redis Pub/Sub）                                 │
│  - HITL 状态机                                               │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   PostgreSQL    │  │     Redis       │  │   Agent Worker  │
│  generation_tasks│  │  Pub/Sub 实时   │  │  执行 LangGraph │
│  task_events    │  │  事件广播       │  │  调用 processAgentStream │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 数据库 Schema 变更

#### generation_tasks 表扩展

```sql
-- 新增字段
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS
  thread_id TEXT,                    -- LangGraph thread ID (HITL)
  hitl_status TEXT DEFAULT 'none',   -- 'none' | 'pending' | 'responded'
  hitl_data JSONB,                   -- { question, options, context }
  hitl_response JSONB,               -- 用户响应
  progress INTEGER DEFAULT 0,        -- 进度 0-100
  current_agent TEXT,                -- 当前执行的 agent
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metadata JSONB;                    -- 额外配置 { referenceImages, provider, etc }

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_thread_id ON generation_tasks(thread_id);
```

#### task_events 表（新建）

```sql
CREATE TABLE IF NOT EXISTS task_events (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
  event_index INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, event_index)
);

CREATE INDEX idx_task_events_task_id ON task_events(task_id);
CREATE INDEX idx_task_events_lookup ON task_events(task_id, event_index);
```

### API 设计

#### 1. 提交任务 `POST /api/tasks`

```typescript
// Request
{
  message: string;           // 用户输入
  themeId: number;
  enableHITL?: boolean;      // 默认 false（后台运行）
  referenceImages?: string[];
  imageGenProvider?: string;
  sourceTaskId?: number;     // Rerun 时传入原任务 ID
}

// Response (立即返回)
{
  taskId: number;
  threadId?: string;         // enableHITL=true 时返回
  status: 'queued';
}
```

#### 2. 订阅事件 `GET /api/tasks/:taskId/events`

```typescript
// Query params
{
  fromIndex?: number;  // 断线重连时，从这个 index 开始
}

// SSE 响应
data: {"eventIndex":0,"type":"agent_start","agent":"supervisor",...}
data: {"eventIndex":1,"type":"message","agent":"writer_agent",...}
data: {"eventIndex":20,"type":"ask_user","question":"...",...}
data: {"eventIndex":99,"type":"workflow_complete",...}
data: [DONE]
```

#### 3. HITL 响应 `POST /api/tasks/:taskId/respond`

```typescript
// Request
{
  action: 'approve' | 'reject';
  selectedIds?: string[];
  customInput?: string;
  modifiedData?: any;
}

// Response
{
  success: boolean;
  status: 'running';  // 任务继续执行
}
```

#### 4. 查询状态 `GET /api/tasks/:taskId`

```typescript
// Response
{
  id: number;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  currentAgent?: string;
  hitlStatus?: 'none' | 'pending' | 'responded';
  hitlData?: { question, options, context };
  creativeId?: number;
  errorMessage?: string;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### 任务状态机

```
                 submit
    ┌─────────────────────────────┐
    │                             ▼
┌───────┐     start      ┌─────────────┐
│queued │ ─────────────▶ │   running   │
└───────┘                └─────────────┘
                               │
              ┌────────────────┼────────────────┐
              │ ask_user       │ complete       │ error
              ▼                ▼                ▼
        ┌──────────┐    ┌───────────┐    ┌──────────┐
        │  paused  │    │ completed │    │  failed  │
        └──────────┘    └───────────┘    └──────────┘
              │
              │ respond
              ▼
        ┌─────────────┐
        │   running   │ ─────▶ (循环直到 complete/fail)
        └─────────────┘
```

### 文件结构

```
src/server/services/task/
├── index.ts                  # 导出 TaskManager
├── taskManager.ts            # 核心管理器
├── taskWorker.ts             # 后台执行逻辑
├── taskEventStore.ts         # 事件持久化
├── taskPubSub.ts             # Redis Pub/Sub
└── types.ts                  # 类型定义

src/pages/api/tasks/
├── index.ts                  # POST: 提交任务
└── [taskId]/
    ├── index.ts              # GET: 状态查询
    ├── events.ts             # GET: SSE 订阅
    └── respond.ts            # POST: HITL 响应
```

### Redis 使用

#### Pub/Sub 通道

```
task:events:{taskId}    # 任务事件广播
```

#### 发布事件

```typescript
redis.publish(`task:events:${taskId}`, JSON.stringify({
  eventIndex: 5,
  type: 'agent_start',
  agent: 'writer_agent',
  ...
}));
```

#### 订阅事件（SSE 端点）

```typescript
const subscriber = redis.duplicate();
await subscriber.subscribe(`task:events:${taskId}`);

subscriber.on('message', (channel, message) => {
  res.write(`data: ${message}\n\n`);
});
```

### 代码复用

#### 复用 processAgentStream

```typescript
// taskWorker.ts
async function executeTask(taskId: number) {
  const task = await getTask(taskId);
  const app = await createMultiAgentSystem({ enableHITL: task.enableHITL, threadId: task.threadId });

  const stream = await app.stream(buildInitialState(task), { recursionLimit: 100 });

  let eventIndex = 0;
  for await (const event of processAgentStream(stream, {
    themeId: task.themeId,
    creativeId: task.creativeId,
    enableHITL: task.enableHITL,
    threadId: task.threadId,
  })) {
    // 1. 持久化到 task_events
    await persistEvent(taskId, eventIndex, event);

    // 2. 广播到 Redis
    await publishEvent(taskId, { ...event, eventIndex });

    // 3. 更新任务进度
    await updateTaskProgress(taskId, event);

    // 4. HITL 暂停
    if (event.type === 'ask_user') {
      await pauseTask(taskId, event);
      return; // 暂停执行
    }

    eventIndex++;
  }

  await completeTask(taskId);
}
```

### 迁移计划

#### Phase 1: 基础设施
1. 添加 Redis 客户端 (ioredis)
2. 扩展 generation_tasks 表
3. 创建 task_events 表
4. 实现 TaskManager 核心

#### Phase 2: API 端点
1. POST /api/tasks
2. GET /api/tasks/:id/events
3. POST /api/tasks/:id/respond
4. GET /api/tasks/:id

#### Phase 3: 前端适配
1. 修改 ScheduledIdeasPanel 的 Rerun
2. 可选：迁移 AgentCreator 到新 API

#### Phase 4: 清理
1. 废弃 /api/agent/run-background
2. 可选：废弃 /api/agent/stream（或保留兼容）
