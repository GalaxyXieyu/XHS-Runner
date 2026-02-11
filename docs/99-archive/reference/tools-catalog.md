# 工具清单（参考）

按 Agent 归类列出可调用工具名称与用途，便于查阅。

## Supervisor
- `managePrompt`：提示词管理
- `recommendTemplates`：模板推荐

## Research
- `searchNotes`：检索已抓取笔记
- `analyzeTopTags`：热门标签分析
- `getTopTitles`：爆款标题
- `getTrendReport`：趋势报告
- `webSearch`：联网搜索
- `askUser`：向用户补充提问

## Writer
- `askUser`：向用户补充提问

## Style Analyzer
- `analyzeReferenceImage`：参考图风格分析

## Image Planner
- `askUser`：向用户补充提问
- `saveImagePlan`：保存图片规划

## Image Generation
- `generateImage`：单张图片生成
- `generate_with_reference`：带参考图生成
- `generate_images`：简化的批量生图
- `generate_images_batch`：串行批量生图

说明：image 相关工具主要作为工具库/兼容入口，当前 image_agent 还包含直接调用服务生成图片的路径。
