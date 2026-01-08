# xhs-mcp 登录与鉴权流程设计

## 登录入口
- MCP 工具：`xhs_auth_login` / `xhs_auth_logout` / `xhs_auth_status`。
- CLI：`npx xhs-mcp login --timeout 120`。

## 会话与凭据存储
- xhs-mcp 默认数据目录：`~/.xhs-mcp`。
- Cookie 文件：`~/.xhs-mcp/cookies.json`。
- 建议：后端只保存登录状态与用户标识，不直接读取 cookie 明文。

## 建议流程（HTTP MCP）
1. 前端触发登录：调用 `auth:login` → 触发 `xhs_auth_login`。
2. MCP 启动浏览器扫码，登录成功后写入 cookie。
3. 后端轮询 `xhs_auth_status`，成功后更新 accounts 表 `auth_status` 与 `last_login_at`。
4. 失败/超时：返回 `E_AUTH_REQUIRED` 并提示重新扫码。

## 需要新增/补充接口
- `accounts:login`：触发 MCP 登录。
- `accounts:status`：查询 MCP 登录状态。
- `accounts:logout`：清理登录态。

## 参考
- `xhs-mcp/README.md:67`
- `xhs-mcp/src/shared/config.ts:40`
- `docs/api/ApiCatalog.md:75`
