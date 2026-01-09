# XHS Generator

这是一个 Electron + Next.js 应用，内置 XHS core 服务，运行时不依赖外部 MCP HTTP。

## 代码架构（核心路径）

- **UI 层**：`pages/` + `components/`
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


