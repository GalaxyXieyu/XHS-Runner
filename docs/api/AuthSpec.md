# 统一鉴权机制与权限策略

## 目标
提供统一的鉴权与授权规范，支持 IPC 与未来 HTTP 接口共用，确保可审计与可扩展。

## 鉴权流程
- 登录后生成 session token（sessions 表），客户端保存并随请求携带。
- HTTP 建议：`Authorization: Bearer <token>`。
- IPC 建议：在 payload 中携带 `session_token`，由主进程统一校验。

## 授权模型
- 角色：admin / editor / viewer（可扩展）。
- 权限域：主题管理、内容创作、发布、互动、配置、账号授权。

| 权限域 | admin | editor | viewer |
| --- | --- | --- | --- |
| 主题管理 | ✅ | ✅ | 只读 |
| 内容创作 | ✅ | ✅ | 只读 |
| 发布 | ✅ | ✅ | ❌ |
| 互动回复 | ✅ | ✅ | ❌ |
| 系统配置 | ✅ | ❌ | ❌ |
| 账号授权 | ✅ | ❌ | ❌ |

## 失败与错误码
- 未登录：E_AUTH_REQUIRED
- 无权限：E_FORBIDDEN
- 会话过期：E_AUTH_EXPIRED

## IPC/HTTP 统一规范
- 所有入口统一走鉴权校验中间层。
- 业务接口不得自行解析 token，只接收校验后的 user_id / role。

## 参考
- `docs/api/UserModel.md:1`
- `electron/preload.js:3`
