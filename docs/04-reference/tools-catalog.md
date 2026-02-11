# Tools Catalog（核心）

## supervisor
- `managePrompt`
- `recommendTemplates`
- `askUser`

## research_evidence_agent
- `searchNotes`
- `analyzeTopTags`
- `getTopTitles`
- `getTrendReport`
- `webSearch`
- `askUser`

## reference_intelligence_agent
- 主要走节点内分析逻辑（参考图语义/风格解析）

## writer/layout/image_planner/review
- 通过 `askUser` 做补充澄清

## image_agent
- `generateImage`
-（动态路径）`generate_with_reference` / `generate_images_batch`

> 以代码为准：`src/server/agents/tools/index.ts`
