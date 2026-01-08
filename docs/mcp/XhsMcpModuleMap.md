# xhs-mcp 模块映射清单（core vs server）

## 可直接复用的 core 服务

- auth
  - AuthService（登录/登出/状态）
  - 依赖：shared/config、shared/logger、browser 管理
- browser
  - BrowserManager / BrowserPoolService（浏览器生命周期）
  - 依赖：shared/config
- feeds
  - FeedService（推荐流/搜索/详情/评论）
  - 依赖：browser 管理、shared/config
- publishing
  - PublishService（发布内容）
  - 依赖：browser 管理、shared/config、shared/title-validator
- notes
  - NoteService（用户笔记/删除封装）
  - 依赖：DeleteService、browser 管理
- deleting
  - DeleteService（删除笔记）
  - 依赖：browser 管理、shared/config

## 需要隔离的协议/传输层

- server
  - mcp.server.ts（MCP JSON-RPC 服务器实现）
  - http.server.ts（HTTP/SSE 传输与 /mcp 端点）
  - handlers/tool.handlers.ts（tool name → core service 调用映射）
- cli
  - CLI 命令入口与参数解析（面向命令行）

## 复用建议（内置服务方向）

- 直接实例化 core 服务（AuthService/FeedService/PublishService/NoteService/DeleteService）。
- 通过共享 config/logger 复用统一配置与日志输出。
- 将 tool.handlers 的入参校验与参数整理逻辑迁移为内部适配层（非 MCP 协议）。

## 参考

- `xhs-mcp/src/core/index.ts:1`
- `xhs-mcp/src/server/index.ts:1`
- `xhs-mcp/src/server/handlers/tool.handlers.ts:1`
