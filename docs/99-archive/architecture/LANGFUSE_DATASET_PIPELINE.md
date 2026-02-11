# Langfuse 数据集闭环方案

## 目标

实现 Agent 执行数据的自动记录、评分、优化闭环：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        闭环流程                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Agent 执行           → 自动记录 input/output 到 Dataset         │
│  2. Langfuse UI 查看      → 人工评分（好/坏样本）                    │
│  3. 导出高分样本          → 生成 few-shot 示例                       │
│  4. 更新 Prompt          → 同步到 Langfuse                           │
│  5. 新版本生效            → 回到步骤 1 验证效果                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 一、数据集设计

### 1.1 命名规范

每个 Agent 对应一个 Dataset：

| Agent Name | Dataset Name |
|------------|--------------|
| supervisor | `xhs-dataset-supervisor` |
| writer_agent | `xhs-dataset-writer_agent` |
| research_agent | `xhs-dataset-research_agent` |
| style_analyzer_agent | `xhs-dataset-style_analyzer_agent` |
| image_planner_agent | `xhs-dataset-image_planner_agent` |
| image_agent | `xhs-dataset-image_agent` |
| review_agent | `xhs-dataset-review_agent` |

### 1.2 Dataset Item 结构

```typescript
interface DatasetItem {
  datasetName: string;       // 如 "xhs-dataset-writer_agent"
  input: any;                // Agent 输入
  expectedOutput?: any;      // 可选：人工标注的期望输出
  sourceTraceId?: string;    // 关联的 trace ID（用于追溯）
  sourceObservationId?: string; // 关联的 generation ID
  metadata?: {
    themeId?: number;
    taskId?: number;
    timestamp: string;
    agent: string;
    model?: string;
  };
}
```

---

## 二、实现步骤

### Phase 1: 扩展 Langfuse Service

**文件**: `src/server/services/langfuseService.ts`

```typescript
// ============================================
// 新增：Dataset 操作函数
// ============================================

/**
 * 获取或创建指定 agent 的数据集
 */
export async function getOrCreateDataset(agentName: string): Promise<string> {
  const langfuse = await getLangfuse();
  if (!langfuse) throw new Error('Langfuse not enabled');

  const datasetName = `xhs-dataset-${agentName}`;

  try {
    // 尝试获取已存在的数据集
    await langfuse.api.datasets.get({ datasetName });
    return datasetName;
  } catch (e) {
    // 不存在则创建
    await langfuse.api.datasets.create({
      name: datasetName,
      description: `Agent dataset for ${agentName}`,
      metadata: {
        project: 'xhs-generator',
        agent: agentName,
        createdAt: new Date().toISOString(),
      },
    });
    return datasetName;
  }
}

/**
 * 添加样本到数据集
 */
export async function addDatasetItem(params: {
  agentName: string;
  input: any;
  output: any;
  traceId?: string;
  observationId?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const langfuse = await getLangfuse();
  if (!langfuse) return;

  const datasetName = await getOrCreateDataset(params.agentName);

  await langfuse.api.datasetItems.create({
    datasetName,
    input: params.input,
    expectedOutput: params.output, // 将实际输出作为期望输出（可后续人工修正）
    sourceTraceId: params.traceId,
    sourceObservationId: params.observationId,
    metadata: {
      ...params.metadata,
      createdAt: new Date().toISOString(),
    },
  });
}

/**
 * 为 trace 添加评分
 */
export async function scoreTrace(params: {
  traceId: string;
  name: string;        // 如 'quality', 'accuracy', 'creativity'
  value: number;       // 0-1
  comment?: string;
}): Promise<void> {
  const langfuse = await getLangfuse();
  if (!langfuse) return;

  await langfuse.api.traces.score({
    traceId: params.traceId,
    name: params.name,
    value: params.value,
    comment: params.comment,
  });
}

/**
 * 批量评分（用于实验运行后）
 */
export async function scoreExperiment(params: {
  runName: string;
  scores: Array<{ traceId: string; name: string; value: number; comment?: string }>;
}): Promise<void> {
  const langfuse = await getLangfuse();
  if (!langfuse) return;

  for (const score of params.scores) {
    await scoreTrace({ ...score });
  }
}
```

---

### Phase 2: 修改 Agent Stream 记录逻辑

**文件**: `src/pages/api/agent/stream.ts`

在 Agent 执行完成时记录到 Dataset：

```typescript
// ============================================
// 修改点 1：记录每个 agent 的输入输出
// ============================================

// 在 processAgentStream 的事件处理中添加
// 位置：约 line 455-463 附近的 logGeneration 后面

async function handleAgentEndEvent(
  event: AgentEvent,
  traceId: string,
  agentInputs: Map<string, any>,
  generationId?: string
) {
  if (event.type === 'agent_end' && event.agent) {
    const agentInput = agentInputs.get(event.agent);

    // 记录到 dataset
    await addDatasetItem({
      agentName: event.agent,
      input: agentInput,
      output: event.output || event.content,
      traceId: traceId,
      observationId: generationId,
      metadata: {
        themeId: event.themeId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// ============================================
// 修改点 2：收集 agent 输入
// ============================================

// 在处理 agent_start 事件时保存输入
// 位置：约 line 390-410

const agentInputs = new Map<string, any>();

// 当收到 agent_start 事件时
if (event.type === 'agent_start') {
  agentInputs.set(event.agent, {
    state: event.state,
    message: event.message,
  });
}

// 当收到 agent_end 事件时
if (event.type === 'agent_end') {
  await handleAgentEndEvent(event, traceId!, agentInputs, lastGenerationId);
}
```

---

### Phase 3: 添加评分 API

**文件**: `src/pages/api/langfuse/score.ts` (新建)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { scoreTrace, isLangfuseEnabled } from '@/server/services/langfuseService';

export async function POST(req: NextRequest) {
  try {
    const enabled = await isLangfuseEnabled();
    if (!enabled) {
      return NextResponse.json(
        { error: 'Langfuse not enabled' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { traceId, name, value, comment } = body;

    if (!traceId || !name || typeof value !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields: traceId, name, value' },
        { status: 400 }
      );
    }

    await scoreTrace({ traceId, name, value, comment });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

---

### Phase 4: 导出好样本脚本

**文件**: `scripts/export-good-samples.ts` (新建)

```typescript
import { getLangfuse } from '../src/server/services/langfuseService';

interface Sample {
  input: any;
  output: any;
  score: number;
  traceId: string;
}

/**
 * 从 Langfuse 导出高分样本
 *
 * 用法：
 *   npx tsx scripts/export-good-samples.ts --agent=writer_agent --minScore=0.8 --output=samples/writer.json
 */
async function main() {
  const args = process.argv.slice(2);
  const agentName = args.find((a) => a.startsWith('--agent='))?.split('=')[1];
  const minScore = parseFloat(
    args.find((a) => a.startsWith('--minScore='))?.split('=')[1] || '0.8'
  );
  const outputFile = args.find((a) => a.startsWith('--output='))?.split('=')[1];

  if (!agentName) {
    console.error('Usage: --agent=<agent_name> [--minScore=0.8] [--output=<path>]');
    process.exit(1);
  }

  const langfuse = await getLangfuse();
  if (!langfuse) {
    console.error('Langfuse not enabled');
    process.exit(1);
  }

  const datasetName = `xhs-dataset-${agentName}`;

  // 1. 获取数据集所有 items
  const items = await langfuse.api.datasetItems.list({
    datasetName,
  });

  console.log(`Found ${items.data.length} items in ${datasetName}`);

  // 2. 获取每个 item 关联的 trace，检查评分
  const goodSamples: Sample[] = [];

  for (const item of items.data) {
    if (!item.sourceTraceId) continue;

    // 获取 trace 及其评分
    const trace = await langfuse.api.traces.get({ traceId: item.sourceTraceId });
    const qualityScore = trace.data.scores?.find((s) => s.name === 'quality');

    if (qualityScore && qualityScore.value >= minScore) {
      goodSamples.push({
        input: item.input,
        output: item.expectedOutput,
        score: qualityScore.value,
        traceId: item.sourceTraceId,
      });
    }
  }

  console.log(`Found ${goodSamples.length} samples with score >= ${minScore}`);

  // 3. 输出结果
  const output = outputFile || `samples/${agentName}_good_samples.json`;
  const fs = await import('fs');
  await fs.promises.mkdir('samples', { recursive: true });
  await fs.promises.writeFile(output, JSON.stringify(goodSamples, null, 2));

  console.log(`Exported to ${output}`);

  // 4. 生成 few-shot 格式示例（用于 prompt 更新）
  const fewShotExamples = goodSamples.map((s) => ({
    input: s.input,
    output: s.output,
  }));

  const fewShotFile = output.replace('.json', '_fewshot.json');
  await fs.promises.writeFile(fewShotFile, JSON.stringify(fewShotExamples, null, 2));

  console.log(`Few-shot format exported to ${fewShotFile}`);
}

main().catch(console.error);
```

---

## 三、数据库变更

**无需变更数据库** - Langfuse Dataset 数据存储在 Langfuse 服务端。

---

## 四、测试方案

### 4.1 单元测试

**文件**: `src/server/services/langfuseService.test.ts` (新建)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrCreateDataset, addDatasetItem, scoreTrace } from './langfuseService';

// Mock Langfuse
vi.mock('langfuse', () => ({
  default: vi.fn().mockImplementation(() => ({
    api: {
      datasets: {
        get: vi.fn(),
        create: vi.fn(),
      },
      datasetItems: {
        create: vi.fn(),
        list: vi.fn(),
      },
      traces: {
        get: vi.fn(),
        score: vi.fn(),
      },
    },
  })),
}));

describe('Langfuse Dataset Operations', () => {
  describe('getOrCreateDataset', () => {
    it('should create new dataset if not exists', async () => {
      // 测试逻辑...
    });

    it('should return existing dataset', async () => {
      // 测试逻辑...
    });
  });

  describe('addDatasetItem', () => {
    it('should add item with correct structure', async () => {
      // 测试逻辑...
    });
  });

  describe('scoreTrace', () => {
    it('should score trace with value 0-1', async () => {
      // 测试逻辑...
    });
  });
});
```

### 4.2 集成测试

**文件**: `tests/integration/langfuse-dataset.test.ts` (新建)

```typescript
/**
 * 集成测试：完整的 Dataset 闭环流程
 *
 * 前置条件：
 * 1. Langfuse 服务运行（本地或云端）
 * 2. 环境变量配置完成
 *
 * 测试流程：
 * 1. 运行一个 agent 任务
 * 2. 验证 Dataset 被创建
 * 3. 验证 Dataset Item 被添加
 * 4. 为 Trace 添加评分
 * 5. 导出高分样本
 * 6. 验证导出结果
 */
```

### 4.3 手动验证流程

**步骤 1：验证 Dataset 自动创建**

```bash
# 1. 运行一个 agent 任务
curl -X POST http://localhost:3000/api/agent/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "生成一篇小红书笔记", "themeId": 1}'

# 2. 在 Langfuse UI 查看是否创建了对应 Dataset
# 访问: http://localhost:23022/datasets
# 应该能看到: xhs-dataset-writer_agent, xhs-dataset-supervisor 等
```

**步骤 2：验证 Dataset Item 记录**

```bash
# 在 Langfuse UI 中：
# 1. 进入 Dataset -> xhs-dataset-writer_agent
# 2. 查看 Items 列表
# 3. 点击某个 Item，查看 sourceTraceId 是否正确关联
```

**步骤 3：验证评分功能**

```bash
# 调用评分 API
curl -X POST http://localhost:3000/api/langfuse/score \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "<从 UI 复制的 trace ID>",
    "name": "quality",
    "value": 0.9,
    "comment": "生成的标题很有创意"
  }'

# 在 Langfuse UI 中验证评分是否显示
```

**步骤 4：验证导出功能**

```bash
# 1. 先为几个 trace 打分（通过 UI 或 API）
# 2. 运行导出脚本
npx tsx scripts/export-good-samples.ts --agent=writer_agent --minScore=0.8

# 3. 查看输出文件
cat samples/writer_agent_good_samples.json
cat samples/writer_agent_good_samples_fewshot.json
```

---

## 五、验收标准

### 5.1 功能验收

| 功能 | 验收标准 |
|------|----------|
| **Dataset 自动创建** | Agent 首次运行后，在 Langfuse UI 中能看到对应 Dataset |
| **Dataset Item 记录** | 每个 Agent 执行后，其 input/output 被记录到对应 Dataset |
| **Trace 关联** | Dataset Item 的 sourceTraceId 正确关联到原始 trace |
| **评分功能** | 通过 API 能成功为 trace 添加评分，并在 UI 中显示 |
| **导出功能** | 能按 minScore 筛选并导出高分样本为 JSON 文件 |

### 5.2 性能验收

| 指标 | 要求 |
|------|------|
| **记录延迟** | addDatasetItem 调用延迟 < 500ms（异步） |
| **对 Agent 执行影响** | 不影响现有 agent 执行速度 |
| **并发支持** | 多个 agent 同时运行时正确记录 |

### 5.3 数据质量验收

| 检查项 | 要求 |
|--------|------|
| **Input 完整性** | Agent 输入包含 state、message 等必要信息 |
| **Output 完整性** | Agent 输出包含完整响应内容 |
| **Metadata 完整性** | themeId、timestamp 等元数据正确记录 |
| **Trace 可追溯** | 通过 sourceTraceId 能追溯到完整执行过程 |

---

## 六、使用流程（最终用户）

### 6.1 日常运行（自动记录）

```bash
# 运行 agent 任务
npm run dev:next
# 前端操作：点击 "生成创意"
# → 自动记录到 Dataset（无需手动操作）
```

### 6.2 评分流程

**方式 A：通过 Langfuse UI**
1. 访问 Langfuse UI
2. 进入 Traces 页面
3. 选择一个 trace
4. 点击 "Add Score"
5. 填写评分（0-1）和评论

**方式 B：通过 API**
```bash
curl -X POST http://localhost:3000/api/langfuse/score \
  -d '{"traceId": "xxx", "name": "quality", "value": 0.9}'
```

### 6.3 优化 Prompt 流程

```bash
# 1. 导出高分样本
npx tsx scripts/export-good-samples.ts --agent=writer_agent --minScore=0.8

# 2. 将导出的 few-shot 示例添加到 prompt
# vim prompts/writer_agent.yaml
# 在 examples 部分添加导出的样本

# 3. 同步到 Langfuse
npx tsx scripts/sync-prompts-to-langfuse.ts

# 4. 运行新任务验证效果
```

---

## 七、文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/server/services/langfuseService.ts` | 修改 | 添加 Dataset 操作函数 |
| `src/pages/api/agent/stream.ts` | 修改 | Agent 完成时记录到 Dataset |
| `src/pages/api/langfuse/score.ts` | 新建 | 评分 API 端点 |
| `scripts/export-good-samples.ts` | 新建 | 导出高分样本脚本 |
| `src/server/services/langfuseService.test.ts` | 新建 | 单元测试 |
| `tests/integration/langfuse-dataset.test.ts` | 新建 | 集成测试 |
| `samples/` | 新建目录 | 导出样本存放目录 |

---

## 八、依赖

无需新增依赖。当前 `langfuse@^3.38.6` 已支持所有所需功能。

---

## 九、注意事项

1. **异步记录**：Dataset 记录应异步执行，不阻塞 Agent 正常流程
2. **错误处理**：Langfuse 不可用时不影响 Agent 执行，只记录日志
3. **数据隐私**：确认记录到 Langfuse 的数据不包含敏感信息
4. **存储限制**：Langfuse Cloud 有存储限制，注意定期清理低质量样本
