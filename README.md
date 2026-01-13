# XHS Generator

小红书内容分析工具 - Electron + Next.js 桌面应用，支持笔记抓取、数据洞察、AI 分析。

## 功能特性

### 已实现
- **主题管理**: 创建多个主题，每个主题支持多关键词抓取
- **笔记抓取**: 自动抓取小红书笔记（标题/作者/互动数据/封面）
- **数据洞察**: 热门标签提取、爆款标题排行、互动统计
- **AI 分析**: LLM 总结爆款标题规律、生成趋势报告
- **筛选排序**: 按时间范围、互动类型筛选和排序

### 开发中
- 视频笔记过滤
- 词云可视化
- 历史趋势图表

## 代码架构（核心路径）

- **UI 层**：`src/pages/` + `src/components/`
- **服务层（TS）**：`src/server/services/xhs/`
  - `xhsClient.ts`：统一入口，负责 local/mock 驱动选择与参数标准化
  - `localService.ts`：内置服务适配层，调用 xhs-core
  - `capture.ts`：抓取流程入口（调用 xhsClient）
- **运行时输出**：`electron/server/`（由 `npm run build:server` 生成）
- **主进程**：`electron/main.js`（仅做 IPC 路由与依赖注入）
- **内联 core**：`electron/mcp/xhs-core/`（Auth/Feed/Publish/Note/Delete + shared）
- **数据层**：`src/server/db.ts` + `data/schema.*`

## 运行模式

- `XHS_MCP_DRIVER=local|mock`（默认 local）
- 需要先构建服务层：`npm run build:server`
- local 需要先构建 core：`npm run build:xhs-core`

## 常用命令

- 开发模式：`npm run dev`
- 构建内置 core：`npm run build:xhs-core`
- 构建服务层：`npm run build:server`
- 登录与抓取冒烟：`npm run smoke:xhs`

## 参考文档

- `docs/mcp/LocalServiceArchitecture.md`
- `docs/mcp/CallchainInventory.md`
- `docs/mcp/LocalModeSmoke.md`
