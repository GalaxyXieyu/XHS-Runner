# AgentState 关键字段

> 完整定义见 `src/server/agents/state/agentState.ts`。

## 路由与流程
- `currentAgent`
- `iterationCount` / `maxIterations`
- `briefComplete`
- `evidenceComplete`
- `referenceIntelligenceComplete`
- `contentComplete`
- `layoutComplete`
- `imagesComplete`

## 输入与上下文
- `messages`
- `threadId`
- `referenceImageUrl`
- `referenceImages`
- `referenceInputs`
- `layoutPreference`
- `contentType`

## 中间产物
- `creativeBrief`
- `evidencePack`
- `referenceAnalyses`
- `layoutSpec`
- `paragraphImageBindings`
- `textOverlayPlan`
- `imagePlans`

## 结果与质量
- `generatedContent`
- `generatedImagePaths`
- `generatedImageAssetIds`
- `reviewFeedback`
- `qualityScores`

## 交互控制
- `pendingConfirmation`
- `agentClarificationKeys`
- `lastError`
