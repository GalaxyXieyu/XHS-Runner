# 本地模式冒烟步骤（未执行）

## 前置条件

- 构建内置 core：`npm run build:xhs-core`
- 设置驱动与必要配置：
  - `XHS_MCP_DRIVER=local`
  - （如需要）`XHS_MCP_XSEC_TOKEN=<token>`
  - （可选）`XHS_BROWSER_PATH=<path>`

## 冒烟步骤

1. 启动 Electron 应用：`npm run dev`
2. 执行关键词抓取（调用 `fetchTopNotes`）并确认 topics 写入。
3. 执行用户笔记拉取（`fetchUserNotes`）并确认返回结构。
4. 执行详情/评论/删除（需要 `xsec_token`）。
5. 验证 mock/legacy 切换不受影响。

## 结果记录

- 状态：未执行（待验证）
- 备注：执行后可在此记录每步结果与失败原因。

## 参考

- `electron/xhsClient.js:1`
- `electron/mcp/localService.js:1`
