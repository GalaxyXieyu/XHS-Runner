# Langfuse Dataset Pipeline（V2）

## 目标

建立“执行数据 -> 评估 -> Prompt 迭代”的闭环，并与单链路 Agent V2 对齐。

## Dataset 命名

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

## 数据来源

- 主链路执行事件来自：`/api/agent/stream`
- 统一事件转换来自：`src/server/agents/utils/streamProcessor.ts`
- Dataset 写入能力：`src/server/services/langfuseService.ts`

## 建议流程

1. 运行任务并自动记录 agent 输入/输出
2. 在 Langfuse 对样本打分（可读性、准确性、平台匹配）
3. 导出高质量样本，反哺 Prompt
4. 使用评估脚本回归验证：
   - `npm run eval:clarification`
   - `npm run eval:agent-clarification`
