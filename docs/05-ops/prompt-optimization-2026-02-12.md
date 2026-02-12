# Agent 提示词优化记录

## 优化时间
2026-02-12

## 问题诊断
Agent 流程执行缓慢，主要原因是：
1. **输出过于冗长** - 提示词要求生成的字段过多、描述过长
2. **缺乏明确限制** - 未对输出长度做硬性约束
3. **停止条件模糊** - 如 research_agent 会无限搜索

## 优化策略

### 1. 精简输出字段
| Agent | 优化前 | 优化后 |
|-------|--------|--------|
| brief_compiler | 8个字段 | 5个核心字段 |
| layout_planner | 复杂对象数组 | 简化 blocks + totalImages |
| image_planner | 4个嵌套数组 | 简化 images 数组 |
| review_agent | 5个维度+详细分析 | 3个维度+等级评定 |

### 2. 增加硬性长度限制
```yaml
# 所有提示词统一添加长度约束
topic: "主题（≤10字）"
audience: "受众（≤8字）"
desc: "描述（≤15字）"
prompt: "英文prompt（≤30词）"
```

### 3. 明确停止条件
```yaml
# research_agent 优化前
停止条件：已收集到 3-5 条有价值事实

# research_agent 优化后
停止条件：
- 已收集到 3-4 条有价值事实
- 已调用 2-3 次工具（硬性限制）
```

### 4. 禁止冗长解释
所有提示词统一添加：
```yaml
## 规则
1. 只输出 JSON，禁止任何解释
2. 禁止输出示例、说明、分析
3. 字段值要简洁，不要长句子
```

## 具体变更文件

### 已优化的提示词
1. `prompts/brief_compiler_agent.yaml` - 精简为5个核心字段
2. `prompts/research_agent.yaml` - 明确停止条件，限制输出
3. `prompts/writer_agent.yaml` - 精简内容要求
4. `prompts/layout_planner_agent.yaml` - 大幅简化版式规划
5. `prompts/image_planner_agent.yaml` - 简化图片规划
6. `prompts/review_agent.yaml` - 简化审核维度

### 保持不变的提示词
- `prompts/supervisor.yaml` - 本身已是极简格式

## 预期效果

1. **响应时间减少 30-50%** - 每个 agent 输出长度减少 50%+
2. **token 消耗降低** - 输出更精简，节约 API 成本
3. **流程更稳定** - 明确的停止条件避免无限循环

## 验证方法

运行以下命令测试优化效果：
```bash
# 1. 同步更新的提示词到 Langfuse
npx tsx scripts/sync-prompts-to-langfuse.ts

# 2. 运行端到端测试
npm run eval:agent-clarification

# 3. 观察 agent 执行时间
# 在日志中查看每个节点的执行耗时
```

## 后续优化建议

1. **添加超时控制** - 在 agent 节点添加硬性超时（如 30 秒）
2. **流式输出** - 对于长内容使用流式响应，提升感知速度
3. **缓存机制** - 对 research 结果添加短期缓存
4. **并发执行** - 部分独立节点可以并发执行
