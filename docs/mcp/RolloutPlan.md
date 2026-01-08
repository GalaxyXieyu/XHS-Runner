# 改造优先级与回滚方案

## 改造优先级
1. MCP 服务启动与健康检查（保证可运行）。
2. JSON-RPC 调用封装（xhsClient 改造）。
3. 登录与状态检查（xhs_auth_login/status）。
4. 搜索与详情链路（topics 写库）。
5. 发布/评论等写操作。

## 回滚策略
- 保留 `XHS_MCP_MODE=mock` 与旧 MCP 配置开关。
- 新旧客户端并存：`XHS_MCP_DRIVER=local|legacy`（默认 legacy，兼容 `XHS_MCP_MODE=mcp`）。
- 回滚路径：切换 `XHS_MCP_DRIVER=legacy` 即可回到旧 MCP 调用。
- MCP 服务不可用时降级为 mock，并提示用户。

## 里程碑
- M1：工具列表可用 + login/status
- M2：搜索/详情落库
- M3：发布/评论

## 参考
- `docs/mcp/IntegrationOptions.md:1`
