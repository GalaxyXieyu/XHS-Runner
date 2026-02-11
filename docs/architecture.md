# Agent 路由系统业务逻辑

## 设计理念

### 核心原则

**以 Supervisor 为中心，LLM 驱动路由决策**

1. **Supervisor 决策优先**：路由决策主要由 Supervisor 的 LLM 决策
2. **最小化约束**：只在明显的前置条件缺失时才纠正
3. **优化提示词**：如果 LLM 决策不稳定，优化提示词，而不是加更多限制

---

## 路由流程

```
┌─────────────────────────────────────────────────────────────┐
│                   routeFromSupervisor()                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ 从 Supervisor 消息提取 │
                │   JSON 决策输出    │
                └───────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   决策是否为空？        │
                └───────────────────────┘
                     │ Yes         │ No
                     ▼             ▼
           ┌────────────────┐  ┌──────────────────────┐
           │ 返回 supervisor │  │  决策是 END？         │
           │ 让它重新决策     │  └──────────────────────┘
           └────────────────┘       │ Yes              │ No
                                     ▼                 ▼
                            ┌─────────────────┐  ┌─────────────────┐
                            │可以结束工作流？  │  │检查基本前置条件   │
                            └─────────────────┘  └─────────────────┘
                               │ Yes    │ No        │ Yes      │ No
                               ▼       ▼           ▼          ▼
                             END   返回supervisor 使用决策  纠正到fallback
                                                           │
                                                           ▼
                                                    返回 fallback 节点
```

---

## 核心路由函数

### `routeFromSupervisor()` - 主路由决策

**作用**：基于 Supervisor 的 LLM 决策进行路由。

**业务逻辑**：

1. 从 Supervisor JSON 中提取 `next_agent` 决策
2. 如果没有决策 → 返回 `supervisor` 让它重新决策（提示词问题）
3. 如果决策是 `END` → 检查是否可以结束
4. 检查基本前置条件 → 只在明显错误时纠正
5. 使用 Supervisor 的决策

### `checkBasicPreconditions()` - 基本前置条件检查

**只检查最明显的前置条件缺失**：

| 目标节点 | 前置条件 | Fallback |
|----------|----------|----------|
| `writer_agent` | 需要 `creativeBrief` 或 `briefComplete` | `brief_compiler_agent` |
| `review_agent` | 需要有 `generatedContent.body` | `writer_agent` |
| `image_agent` | 需要 `imagePlans` 不为空 | `image_planner_agent` |

**注意**：这些检查只防止明显错误。如果 Supervisor 经常触发这些检查，说明需要优化提示词。

---

## 辅助路由函数

### `shouldContinueSupervisor()` - Supervisor 继续判断

| 条件 | 返回值 |
|------|--------|
| 有 `tool_calls` | `"supervisor_tools"` |
| 其他 | `"route"` |

### `shouldContinueResearch()` - Research 继续判断

| 条件 | 返回值 |
|------|--------|
| 有 `tool_calls` | `"research_evidence_tools"` |
| 其他 | `"supervisor"` |

### `shouldContinueImage()` - Image 继续判断

| 条件 | 返回值 |
|------|--------|
| `imagesComplete === true` | `"supervisor"` |
| 有 `tool_calls` 且次数 < 10 | `"image_tools"` |
| 有 `tool_calls` 且次数 ≥ 10 | `"supervisor"` |
| 其他 | `"supervisor"` |

### `shouldContinueReview()` - Review 继续判断

| 条件 | 返回值 |
|------|--------|
| `approved && isQualityApproved()` | `END` |
| 其他 | `"supervisor"` |

---

## 质量回退逻辑

### 按质量分数回退

| 质量维度低 | 回退到 |
|-----------|--------|
| `infoDensity` | `research_evidence_agent` |
| `textImageAlignment` | `layout_planner_agent` |
| `styleConsistency` | `reference_intelligence_agent` |
| `readability` | `image_planner_agent` |
| `platformFit` | `writer_agent` |

---

## Supervisor 提示词要求

### 必须包含的内容

1. **明确的 JSON 决策格式**：输出包含 `next_agent` / `guidance` / `context_from_previous` / `focus_areas`
2. **当前流程状态感知**：了解哪些阶段已完成
3. **前置条件意识**：理解依赖关系（如 writer 需要 brief）
4. **回退优化策略**：质量不达标时知道如何回退

### 示例格式

```json
{
  "next_agent": "writer_agent",
  "guidance": "基于 brief 生成正文，强调重点信息",
  "context_from_previous": "research_evidence_agent 提炼了 3 条趋势",
  "focus_areas": ["趋势", "卖点", "可操作建议"]
}

当前状态：
- brief: ✅ 已完成
- evidence: ✅ 已完成
- content: ❌ 未完成

分析：需要生成文案内容

决策输出：见上方 JSON
```

---

## 完整流程图

```
用户输入
    │
    ▼
┌───────────────┐
│  supervisor   │ ◄─────────────────────────────────────────────┐
└───────────────┘                                              │
    │                                                        │
    │  next_agent: xxx                                             │
    │  (由 LLM 决定)                                         │
    ▼                                                        │
┌───────────────┐                                            │
│   目标节点     │                                            │
└───────────────┘                                            │
    │                                                        │
    ▼                                                        │
┌───────────────┐                                            │
│  完成后返回    │                                            │
└───────────────┘                                            │
    │                                                        │
    └────────────────────────────────────────────────────────┘
                 │
                 │ Supervisor 根据状态重新决策
                 ▼
        ┌─────────────────┐
        │  next_agent = END?     │──YES──→ 结束
        │  或 next_agent: xxx   │
        └─────────────────┘
                 │ NO
                 ▼
            继续下一个节点
```

---

## 关键设计原则

### 移除的设计（旧版本）

1. ❌ 固定的阶段顺序 `ROUTE_STAGE_ORDER`
2. ❌ 硬编码的确定性路由 `getDeterministicRoute()`
3. ❌ 复杂的安全检查 `canUseLlmBacktrackRoute()`
4. ❌ 大量的 `*Complete` 状态标记
5. ❌ `paragraphImageBindings` 段落图片绑定（图片生成时全文传递，不需要）

### 新的设计

1. ✅ Supervisor 完全主导路由决策
2. ✅ 简化的状态管理（从 42 个字段减少到 20 个）
3. ✅ 只保留 3 个基本前置条件检查
4. ✅ 更灵活的执行顺序

---

## 状态列表（精简后）

### LangGraph 核心
- `messages` - 消息历史

### 节点输出（后续节点需要用到）
- `creativeBrief` - brief_compiler_agent 输出
- `evidencePack` - research_evidence_agent 输出
- `bodyBlocks` - research_evidence_agent 输出
- `referenceAnalyses` - reference_intelligence_agent 输出
- `layoutSpec` - layout_planner_agent 输出
- `imagePlans` - image_planner_agent 输出
- `generatedContent` - writer_agent 输出
- `generatedImageAssetIds` - image_agent 输出

### 审核与质量控制
- `reviewFeedback` - review_agent 输出
- `qualityScores` - 用于质量回退

### 输入参数
- `referenceImages` - 用户输入
- `layoutPreference` - 用户输入
- `imageGenProvider` - 用户输入

### 流程控制
- `iterationCount` / `maxIterations` - 控制迭代次数
- `clarificationRounds` - 控制 clarification 次数

### HITL 相关
- `threadId` - HITL 需要
- `agentClarificationKeys` - HITL 需要

### 系统使用
- `creativeId` - 关联 creative

---

## 常见问题

### Q: 如果 Supervisor 决策错了怎么办？

A: 应该优化 Supervisor 的提示词，让它理解正确的流程逻辑。如果频繁出错，可以考虑：
1. 在提示词中添加更明确的流程说明
2. 提供 few-shot 示例
3. 强化前置条件的说明

### Q: 如何保证流程顺序正确？

A: 依赖 Supervisor 的提示词设计。在提示词中明确说明：
1. 正常的执行顺序
2. 每个节点的前置条件
3. 何时可以回退优化

### Q: `paragraphImageBindings` 为什么删除了？

A: 因为图片生成时已经是全文传递 context，不需要段落级别的绑定关系。这个字段是早期设计的遗留，实际上 `imageNode` 生成图片时完全没有用到它。
