# XHS Runner

小红书内容分析与运营桌面应用（Electron + Next.js），覆盖主题/关键词管理、采集、洞察、内容生成与运营排期。

## 当前能力

- **主题管理**：主题/关键词/竞品管理
- **抓取采集**：按关键词抓取笔记与互动数据；支持 local/mock 驱动
- **数据洞察**：指标汇总、趋势分析、竞品对比、导出 CSV
- **内容创作**：LLM 流式分析/生成、Prompt Profile、创作包管理
- **运营中心**：发布任务、互动任务、执行历史与队列
- **调度系统**：Cron 任务、限流与失败重试
- **系统设置**：采集频率、LLM/外部服务配置、运行参数

## 开发中 / 计划

- 视频笔记过滤
- 词云可视化
- 历史趋势图表
- 内容生成调试与验证
  - 生成链路可观测性：Prompt 预览、模型/参数、token/耗时、失败原因归因
  - 可重放：同一输入一键复跑 + 版本对比
  - 最小 API 测试：/api/generate、/api/insights/analyze、/api/agent/stream 的基础烟测（先无 DB 场景可跑）
- 发布跟踪与指标体系
  - 基础指标：views/likes/comments/saves/follows
  - 派生指标：互动率、收藏率、评论率、关注转化率、峰值时间、增长斜率
  - 数据采集节奏：发布后 1h/6h/24h/48h/7d 的快照
  - 展示与过滤：按主题/关键词/内容类型/发布时间的对比
- AI 创作建议
  - 输入：高分样本（标题/标签/发布时间/封面/内容结构）+ 指标
  - 输出：标题/标签/发布时间/结构建议 + 可执行模板
  - 运营闭环：建议 → 生成 → 发布 → 回传指标 → 更新建议
- 自动化测试与发布流水线

## 架构概览

- **Electron 主进程**：`electron/main.js`（IPC 路由、窗口生命周期）
- **Preload**：`electron/preload.js`（暴露 IPC API）
- **Renderer UI**：`src/pages/` + `src/components/`
- **服务层（TS）**：`src/server/services/xhs/`
- **Next API**：`src/pages/api/`（桥接服务层）
- **编译产物**：`electron/server/`（由 `npm run build:server` 生成）

## 数据与配置

- **数据库**：Drizzle + Postgres（Supabase），需配置 `DATABASE_URL` / `POSTGRES_URL` / `SUPABASE_DB_URL`
- **Supabase 客户端**：`src/server/supabase.ts`（遗留兼容）
- **运行时配置**：`XHS_MCP_DRIVER=local|mock`（默认 local）、`XHS_MCP_XSEC_TOKEN`、`XHS_BROWSER_PATH`
- **本地数据路径**：`XHS_USER_DATA_PATH`（默认 Electron userData）

## 本地开发

- `npm run dev`：启动 Next.js 并拉起 Electron
- `npm run dev:next`：仅启动 Renderer
- `npm run dev:electron`：仅启动 Electron（需 `http://localhost:3000` 就绪）
- `npm run build:server`：编译服务层到 `electron/server/`
- `npm run smoke:xhs` / `npm run smoke:xhs-capture`：登录/抓取冒烟

## 参考文档

- `SETUP.md`
- `docs/Config.md`
- `docs/Settings.md`
- `docs/Workflow.md`
- `docs/Analytics.md`
- `docs/IPC.md`
- `docs/Packaging.md`
- `docs/mcp/LocalModeSmoke.md`
