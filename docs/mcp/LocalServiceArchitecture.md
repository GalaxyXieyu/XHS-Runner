# 内置服务架构设计（替换 MCP 调用）

## 目标

- 业务侧不再依赖 MCP tools/HTTP 接口，直接调用内置服务函数。
- 保留 `xhsClient` 作为统一入口，支持 `local|mock` 驱动切换。

## 分层与职责

### local-service（内置服务层）
- 直接实例化内联 core 服务（`electron/mcp/xhs-core` 下的 AuthService/FeedService/PublishService/NoteService/DeleteService）。
- 负责参数整理、错误转换、调用链日志。
- 不依赖 MCP JSON-RPC / HTTP/SSE 协议层。

### xhsClient（统一入口）
- 根据 `XHS_MCP_DRIVER` 选择调用路径：
  - `local`：走内置服务层
  - `mock`：本地 mock 数据
- 统一超时、异常处理与返回结构。

### 业务服务层
- 仅调用 `xhsClient`，不直接依赖 `xhs-mcp` 模块或协议实现。

## 生命周期与依赖

- 初始化：加载 `xhs-mcp` shared/config；初始化 browser pool（必要时）。
- 运行：local-service 通过 core service 执行业务操作。
- 退出：清理 browser pool、关闭日志句柄。

## 目录建议

```
electron/
  mcp/
    localService.js        # 内置服务适配层（core -> 业务）
    legacyClient.js        # 现有 MCP HTTP client
  xhsClient.js             # 驱动选择与统一入口
```

## 参考

- `docs/mcp/BackendArchitecture.md:1`
- `xhs-mcp/src/core/index.ts:1`
- `electron/xhsClient.js:64`
