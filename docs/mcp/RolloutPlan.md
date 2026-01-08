# 改造优先级与回滚方案

## 改造优先级
1. 内置 core 构建与健康检查（保证可运行）。
2. xhsClient 本地驱动调用封装。
3. 登录与状态检查（xhs_auth_login/status）。
4. 搜索与详情链路（topics 写库）。
5. 发布/评论等写操作。

## 回滚策略
- 保留 `XHS_MCP_DRIVER=mock` 作为降级通道。
- 回滚路径：切换 `XHS_MCP_DRIVER=mock` 使用本地 mock 数据。

## 里程碑
- M1：工具列表可用 + login/status
- M2：搜索/详情落库
- M3：发布/评论

## 参考
- `docs/mcp/IntegrationOptions.md:1`
