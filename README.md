# XHS Generator

这是一个 Electron + Next.js 应用，内置 XHS core 服务，运行时不依赖外部 MCP HTTP。

## 代码架构（核心路径）

- **UI 层**：`pages/` + `components/`
- **主进程服务**：`electron/`
  - `electron/xhsClient.js`：统一入口，负责 local/mock 驱动选择与参数标准化
  - `electron/mcp/localService.js`：内置服务适配层，调用 xhs-core
  - `electron/mcp/xhs-core/`：内联的 core 源码（Auth/Feed/Publish/Note/Delete + shared）
  - `electron/capture.js`：抓取流程入口（调用 xhsClient）
- **数据层**：`electron/db.js` + `data/schema.*`

## 运行模式

- `XHS_MCP_DRIVER=local|mock`（默认 local）
- local 需要先构建 core：`npm run build:xhs-core`

## 常用命令

- 开发模式：`npm run dev`
- 构建内置 core：`npm run build:xhs-core`

## 参考文档

- `docs/mcp/LocalServiceArchitecture.md`
- `docs/mcp/CallchainInventory.md`
- `docs/mcp/LocalModeSmoke.md`
