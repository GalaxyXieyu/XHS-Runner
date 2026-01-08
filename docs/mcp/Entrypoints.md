# xhs-mcp 服务入口与协议说明

## 服务模式
- CLI 模式：通过 `xhs-mcp` 子命令启动与调试。
- MCP 服务模式：支持 stdio 与 HTTP。

## CLI 入口
- 启动 MCP（stdio）：`npx xhs-mcp mcp`
- 启动 MCP（HTTP）：`npx xhs-mcp mcp --mode http --port <port>`
- 调试日志：`XHS_ENABLE_LOGGING=true npx xhs-mcp mcp --mode http`

## HTTP 入口
- Streamable HTTP（协议 2025-03-26）：`/mcp`
- SSE（协议 2024-11-05）：`/sse` 与 `/messages`
- 健康检查：`/health`

## 协议要点
- 标准 MCP JSON-RPC：`initialize` → `tools/list` → `tools/call`。
- SSE 模式需先建立会话，再通过 `/messages?sessionId=...` 发送 JSON-RPC。

## 参考
- `xhs-mcp/README.md:1`
- `xhs-mcp/src/cli/cli.ts:360`
- `xhs-mcp/src/server/http.server.ts:1`
- `xhs-mcp/src/server/mcp.server.ts:1`
