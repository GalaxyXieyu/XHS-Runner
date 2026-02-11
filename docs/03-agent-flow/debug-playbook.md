# 调试手册（Prompt / 路由 / 澄清）

## 1. 最小验证顺序

1. `npm run build:server`
2. `npm run lint:supervisor-prompt`
3. `npm run eval:agent-clarification`
4. `npm run eval:clarification -- --baseUrl=http://localhost:3000`

## 2. 常见问题定位

### 问题 A：supervisor 不提问直接执行
- 检查 `prompts/supervisor.yaml` 是否包含“低清晰度先澄清”规则
- 跑 `eval:clarification` 看澄清命中率

### 问题 B：某个 agent 不提问
- 检查对应节点是否调用 `requestAgentClarification`
- 跑 `eval:agent-clarification` 看该节点是否 PASS

### 问题 C：review 被错误跳过
- 检查 `router.ts` 的 `canUseLlmBacktrackRoute`
- 确认 deterministic route 为 `review_agent` 时未被 supervisor 回退

## 3. 调试输出建议

- 关注 `routeFromSupervisor` 日志：
  - 是否出现“忽略不安全 LLM 路由”
  - 是否出现“采用 supervisor 回退路由”
- 对问题 case 固化为脚本场景，防止回归。
