# 内置服务交付验收清单

## 必备检查

1. 内置服务可用：`XHS_MCP_DRIVER=local` 启动后可完成搜索与写库。
2. 业务路径可跑通：搜索/详情/发布/评论/删除至少各跑通一次。
3. 回滚可执行：切换 `XHS_MCP_DRIVER=mock` 使用本地 mock 数据。

## 附加检查

- 记录本地浏览器路径与登录态存储位置。
- 记录失败时的错误日志与处理方式。

## 参考

- `docs/mcp/LocalModeSmoke.md:1`
- `docs/mcp/RolloutPlan.md:1`
