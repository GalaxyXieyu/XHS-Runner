# xhs-mcp 整合方案与推荐

## 方案对比

### 方案 A：独立进程托管（推荐）
- 方式：主进程启动 `node xhs-mcp/dist/xhs-mcp.js mcp --mode http --port 9999`。
- 优点：隔离依赖、便于重启与日志管理、升级独立。
- 缺点：需要进程管理与健康检查。

### 方案 B：内嵌模块化调用
- 方式：在主进程直接 import xhs-mcp server 模块。
- 优点：调用链更短、配置集中。
- 缺点：依赖重、构建/运行更复杂，耦合高。

## 推荐方案（A）
- 启动时机：Electron 主进程启动后拉起 MCP 子进程。
- 端口：默认 `9999`，通过环境变量可配置。
- 日志：`XHS_ENABLE_LOGGING=true` + 文件日志（由 xhs-mcp 自身管理）。
- 健康检查：`GET /health`；失败时重启子进程。

## 关键配置
- `XHS_MCP_ENDPOINT=http://127.0.0.1:9999/mcp`（Streamable HTTP）
- `XHS_MCP_MODE=mcp`（禁用 mock）
- 可选：`XHS_ENABLE_LOGGING=true`

## 容错策略
- 子进程退出时自动重启（指数退避）。
- 调用失败返回统一错误码并记录 raw 响应。

## 参考
- `xhs-mcp/README.md:58`
- `xhs-mcp/src/cli/cli.ts:364`
- `electron/main.js:42`
