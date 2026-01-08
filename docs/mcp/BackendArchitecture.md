# 后端架构重构建议（MCP 集成）

## 分层建议

### mcp-runner
- 负责启动/停止 `xhs-mcp` 子进程。
- 管理端口、日志与健康检查。
- 统一注入 `XHS_*` 环境变量。

### xhsClient
- 统一 MCP JSON-RPC 调用封装。
- 处理工具名映射、参数规范化与错误转换。

### 业务服务层
- themes/competitors/insights/publish 等服务仅调用 xhsClient。
- 避免业务层直接触达 MCP 协议细节。

## 目录建议
```
electron/
  mcp/
    runner.js
    client.js
  services/
    themeService.js
    publishService.js
```

## 依赖边界
- mcp-runner 不依赖业务服务。
- 业务服务不直接依赖 xhs-mcp 代码，只通过 xhsClient。

## 参考
- `electron/main.js:42`
- `electron/xhsClient.js:64`
