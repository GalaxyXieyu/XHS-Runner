# 本地模式冒烟步骤（未执行）

## 前置条件

- 内置 core 已打包在 `electron/mcp/xhs-core/dist`
- 构建服务层：`npm run build:server`
- 设置驱动与必要配置：
  - `XHS_MCP_DRIVER=local`
  - （如需要）`XHS_MCP_XSEC_TOKEN=<token>`
  - （可选）`XHS_BROWSER_PATH=<path>`
  - （可选）`XHS_SMOKE_SHOW_RAW=true` 输出原始 feed 样例

## 冒烟步骤

1. 启动 Electron 应用：`npm run dev`
2. 执行关键词抓取（调用 `fetchTopNotes`）并确认 topics 写入。
3. 执行用户笔记拉取（`fetchUserNotes`）并确认返回结构。
4. 执行详情/评论/删除（需要 `xsec_token`）。
5. 验证 mock 切换不受影响。

> 可选：使用脚本快速验证 `npm run smoke:xhs`（会检查登录状态并抓取样例数据）。
> 可选：多关键词主题抓取写库验证 `npm run smoke:xhs-capture`（支持 `XHS_TEST_KEYWORDS` 与 `XHS_TEST_LIMIT`）。

## 结果记录

- 状态：未执行（待验证）
- 备注：执行后可在此记录每步结果与失败原因。

## 参考

- `src/server/services/xhs/xhsClient.ts:1`
- `src/server/services/xhs/localService.ts:1`
