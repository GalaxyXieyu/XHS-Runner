# 前端能力-数据-接口映射清单

## 目标
梳理现有前端能力与数据库实体之间的映射关系，明确接口边界与缺口，为后续接口设计与测试提供基线。

## 前端能力概览
- 主题管理：主题增删改查、状态切换、关键词与竞品管理、主题选择。
- 洞察分析：热门笔记/标签、标题公式、用户心声、竞品动态、趋势概览。
- 内容创作：AI 生成、内容筛选、草稿管理、标题/正文/图片变体编辑。
- 运营中心：发布队列、发布状态、评论回复、自动回复、表现趋势、低质提醒。
- 系统设置：账号授权（二维码）、API Key 配置、自动化参数与保留策略。

## 数据实体映射（schema v1.0）

| 实体 | 前端模块 | 关键前端动作 | 需要的接口 | 缺口/冲突点 |
| --- | --- | --- | --- | --- |
| themes | 主题管理 | 新建/编辑/删除/切换状态/选择主题 | themes:list/create/update/remove/setStatus | 前端有 description 字段，schema 未包含；关键词与竞品在独立表中维护 |
| keywords | 主题管理 | 关键词列表/搜索/新增/删除 | keywords:list/create/update/remove | 前端将关键词作为主题的数组字段，需要后端做聚合/拆分 |
| competitors | 主题管理、洞察分析 | 竞品列表/新增/删除/竞品笔记监控 | competitors:list/add/remove + topics:fetchByCompetitor | 前端只录入昵称，schema 需要 xhs_user_id |
| topics | 洞察分析、运营中心 | 热门笔记列表/详情/筛选 | topics:list/detail/refresh | 前端要求标签、封面、作者、指标等字段齐全 |
| comments | 运营中心 | 评论列表/回复/标记已读 | comments:list/reply/markRead | 回复动作需要与 MCP 评论接口对齐 |
| topic_growth_data | 运营中心 | 趋势图表（浏览/点赞/收藏/评论） | topics:growth:list | 需要按 date 维度汇总接口 |
| creatives | 内容创作 | 草稿管理/内容详情/状态切换 | creatives:list/create/update/delete | 前端有 titleVariants、imageVariants 概念，需要映射到子表 |
| creative_assets | 内容创作 | 图片/封面变体管理 | creativeAssets:list/add/remove | 需要区分 url 与本地文件路径 |
| accounts | 系统设置 | 账号授权/状态展示 | accounts:list/create/update/status | 前端需要二维码登录流程与状态轮询 |
| publish_records | 运营中心 | 发布队列/发布记录/状态更新 | publish:list/queue/publish/update | 前端使用 scheduledTime、thumbnail 字段，需映射到 media_urls + scheduled_at |
| interaction_tasks | 运营中心 | 自动回复/首评任务管理 | interactions:list/queue/update | 前端自动回复开关需关联任务策略 |

## 缺口与冲突点清单
- 主题描述字段（Theme.description）在 schema 中缺失，需要补充或在 themes 扩展字段。
- 前端关键词/竞品是主题内数组，后端需提供聚合接口或视图。
- 内容创作的标题/图片变体需要拆分到 creative_assets 或扩展 creatives 的字段结构。
- 发布队列的缩略图、计划时间字段需在接口层统一映射。
- 系统设置中的 API Key 与自动化配置当前无 schema 定义，需补充 settings 相关接口与表结构。

## 参考
- `data/schema.md:1`
- `App.tsx:1`
- `components/ThemeManagement.tsx:1`
- `components/workspace/InsightTab.tsx:1`
- `components/workspace/CreativeTab.tsx:1`
- `components/workspace/ContentDetail.tsx:1`
- `components/workspace/OperationsTab.tsx:1`
- `components/Settings.tsx:1`
