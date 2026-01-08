# 最小 PoC 步骤与验证清单

## PoC 步骤
1. 安装浏览器依赖：`npx xhs-mcp browser`。
2. 启动 MCP HTTP 服务：`npx xhs-mcp mcp --mode http --port 9999`。
3. 调用 `tools/list` 确认服务可用。
4. 调用 `xhs_auth_status` 检查登录态。
5. 调用 `xhs_search_note` 获取笔记列表并保存 `note_id/xsec_token`。
6. 调用 `xhs_get_note_detail` 并落库到 topics。

## 验证清单
- MCP 服务 `/health` 返回正常。
- `tools/list` 返回包含 `xhs_auth_login`/`xhs_search_note`。
- 搜索接口返回 `note_id` 与 `xsec_token`。
- 写库成功（topics/raw_json 有原始数据）。

## 失败处理
- MCP 未启动：检查端口/日志。
- 登录失败：重新执行 `xhs_auth_login`。
- 网络失败：重试或切回 mock 模式。
