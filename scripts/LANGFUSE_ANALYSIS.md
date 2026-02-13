# Langfuse Run Analysis Tools

这套工具用于从 Langfuse 获取和分析 agent 运行数据，提供结构化的性能指标和瓶颈分析。

## 为什么用 Langfuse 而不是本地 artifacts？

Langfuse 提供了：
1. **结构化的 trace/span 数据**：每个 agent、工具调用都有完整的时间戳、输入输出
2. **Token 使用统计**：自动记录每次 LLM 调用的 token 消耗
3. **跨会话查询**：可以按 sessionId、tags、时间范围等维度查询
4. **Web UI**：可视化查看 trace 详情
5. **API 支持**：可以编程方式批量分析

## 工具列表

### 1. `query-langfuse-runs.ts` - 基础查询工具

快速查询 traces，获取原始数据。

```bash
# 查询最近 10 条 traces
npx tsx scripts/query-langfuse-runs.ts --limit 10

# 查询特定 session
npx tsx scripts/query-langfuse-runs.ts --sessionId <session-id>

# 查询最近 24 小时的 traces
npx tsx scripts/query-langfuse-runs.ts --since 24h

# 获取详细信息（包括 observations）
npx tsx scripts/query-langfuse-runs.ts --limit 5 --detailed
```

### 2. `analyze-langfuse-runs.ts` - 性能分析工具

深度分析 agent 性能，计算各种指标。

```bash
# 分析最近 20 条 runs
npx tsx scripts/analyze-langfuse-runs.ts --limit 20

# 分析最近 24 小时的 runs
npx tsx scripts/analyze-langfuse-runs.ts --since 24h

# 导出 metrics 到 JSON 文件
npx tsx scripts/analyze-langfuse-runs.ts --limit 50 --export metrics.json

# 分析特定 session
npx tsx scripts/analyze-langfuse-runs.ts --sessionId <id> --detailed
```

**输出指标：**

- **Summary**：总运行数、平均/P50/P95 耗时、总 token 消耗
- **Agent Metrics**：每个 agent 的平均耗时、P50/P95、token 消耗、工具调用次数
- **Slowest Runs**：最慢的 5 次运行，包括瓶颈 agent

## 配置

工具会按以下优先级查找 Langfuse 配置：

1. **环境变量**（推荐）：
   ```bash
   export LANGFUSE_SECRET_KEY=sk-lf-...
   export LANGFUSE_PUBLIC_KEY=pk-lf-...
   export LANGFUSE_BASE_URL=http://localhost:23022  # 或 https://cloud.langfuse.com
   ```

2. **数据库配置**：从 `extension_services` 表读取（需要 `DATABASE_URL`）

## 使用场景

### 场景 1：找出最慢的 agent

```bash
npx tsx scripts/analyze-langfuse-runs.ts --since 7d --limit 100
```

查看 "Agent Metrics" 部分，按平均耗时排序，找出瓶颈。

### 场景 2：分析特定 session 的问题

```bash
npx tsx scripts/analyze-langfuse-runs.ts --sessionId <id> --detailed
```

查看该 session 的详细 agent 执行情况、token 消耗、工具调用。

### 场景 3：对比不同时间段的性能

```bash
# 上周
npx tsx scripts/analyze-langfuse-runs.ts --since 7d --export last-week.json

# 本周
npx tsx scripts/analyze-langfuse-runs.ts --since 24h --export today.json

# 对比两个 JSON 文件
```

### 场景 4：导出数据给 coding agent 分析

```bash
npx tsx scripts/analyze-langfuse-runs.ts --limit 100 --export runs.json
```

然后让 coding agent 读取 `runs.json`，分析：
- 哪些 agent 输出过长（导致后续 agent 上下文膨胀）
- 哪些 agent 工具调用过多（可能需要优化 prompt）
- HITL 停顿频率（是否需要改进澄清策略）

## 下一步：构建 Skill

基于这些工具，可以构建一个 `agent-analyzer` skill：

```bash
/agent-analyzer --since 7d --focus slow-agents
/agent-analyzer --sessionId <id> --diagnose
/agent-analyzer --compare last-week.json today.json
```

Skill 可以：
1. 自动识别瓶颈 agent
2. 分析 prompt 是否过长
3. 检测工具调用模式异常
4. 给出优化建议（并发、缓存、prompt 优化等）

## 技术细节

### Langfuse API 端点

- `GET /api/public/traces` - 查询 traces
- `GET /api/public/traces/{traceId}` - 获取 trace 详情（包括 observations）
- `POST /api/public/scores` - 添加评分

### 数据结构

**Trace**：一次完整的 agent 流程
- `id`: trace ID
- `sessionId`: 会话 ID（可用于关联多次运行）
- `timestamp`: 开始时间
- `metadata`: 自定义元数据（status、themeId 等）
- `tags`: 标签（用于分类）

**Observation**：trace 中的一个步骤
- `type`: GENERATION（LLM 调用）、SPAN（工具调用/agent 执行）、EVENT（事件）
- `name`: 步骤名称（agent 名称、工具名称）
- `startTime` / `endTime`: 时间戳
- `usage`: token 使用统计
- `input` / `output`: 输入输出数据

### 性能优化建议

1. **并发查询**：`fetchTraceDetails` 使用 `Promise.all` 并发获取
2. **分页查询**：Langfuse API 支持 `page` 和 `limit` 参数
3. **缓存**：可以缓存 trace 详情到本地（`.xhs-data/langfuse-cache/`）
4. **增量更新**：只查询新的 traces（`fromTimestamp`）

## 故障排查

### 错误：Langfuse not configured

确保设置了环境变量或数据库配置。

### 错误：Failed to fetch traces: 401

检查 `LANGFUSE_SECRET_KEY` 和 `LANGFUSE_PUBLIC_KEY` 是否正确。

### 错误：Failed to fetch traces: 404

检查 `LANGFUSE_BASE_URL` 是否正确，Langfuse 服务是否运行。

### 没有数据

确保：
1. Langfuse 集成已启用（`isLangfuseEnabled()` 返回 true）
2. Agent 流程中有调用 `createTrace()` 和 `logGeneration()`/`logSpan()`
3. 调用了 `flushLangfuse()` 确保数据上传

## 参考

- [Langfuse API 文档](https://langfuse.com/docs/api)
- [Langfuse Node SDK](https://langfuse.com/docs/sdk/typescript)
- [项目 Langfuse 集成](../src/server/services/langfuseService.ts)
