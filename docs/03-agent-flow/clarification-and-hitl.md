# 澄清机制与 HITL

## 1. 为什么要做统一澄清

当用户输入过于宽泛时，直接生成会导致：
- 前期规划不足
- 内容命中率低
- 迭代次数增加

因此 V2 中将“是否追问”提升为统一能力，而不是 supervisor 单点能力。

## 2. 当前实现

### supervisor 级澄清
- 基于 `requirementClarity` 判断需求是否缺失关键维度
- 满足条件时优先发起 `ask_user`

### agent 级澄清
下列节点在关键输入不足时都会主动提问：
- `brief_compiler_agent`
- `research_evidence_agent`
- `reference_intelligence_agent`
- `writer_agent`
- `layout_planner_agent`
- `image_planner_agent`
- `image_agent`
- `review_agent`

## 3. 去重策略

- 每次澄清携带 `key`
- 已提过的问题记录在 `agentClarificationKeys`
- 同一 key 只问一次，避免循环追问

## 4. 验证脚本

- `npm run eval:clarification -- --baseUrl=http://localhost:3000`
- `npm run eval:agent-clarification`
- `npm run lint:supervisor-prompt`
