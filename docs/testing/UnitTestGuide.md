# 单元测试开发模式与鉴权测试基座

## 目录结构建议
```
tests/
  unit/
    services/
    ipc/
  fixtures/
    users.json
    themes.json
  helpers/
    authFixture.js
    dbFixture.js
```

## 命名规范
- 文件：`<module>.test.js`
- 用例：`should <行为> when <场景>`

## 鉴权测试基座
- `authFixture` 负责生成 session token 与伪造 user 角色。
- 提供 helper：
  - `withSession(role)`：返回带 token 的上下文。
  - `requireAuth(fn)`：断言未登录返回 E_AUTH_REQUIRED。

## MCP 调用的测试策略
- 单元测试默认使用 `XHS_MCP_MODE=mock`。
- 对 MCP 失败路径提供 mock 响应，验证错误码映射。

## 数据种子与清理
- `dbFixture` 负责插入基础数据：users / themes / keywords。
- 每个测试用例结束后清理或事务回滚，避免串扰。

## 参考
- `docs/api/AuthSpec.md:1`
- `docs/api/McpBoundary.md:1`
