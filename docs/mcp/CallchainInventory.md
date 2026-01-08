# xhsClient 调用链清单

## 当前调用入口

- `electron/capture.js`：`runCapture` → `fetchWithRetry` → `fetchTopNotes` → `xhsClient.fetchTopNotes`。

## xhsClient 导出函数现状

| 函数 | 当前调用方 | 说明 |
| --- | --- | --- |
| fetchTopNotes | `electron/capture.js` | 关键词拉取热门笔记，写入 topics。 |
| fetchUserNotes | 暂无 | 现有仓库未发现调用方。 |
| fetchNoteDetail | 暂无 | 现有仓库未发现调用方。 |
| publishContent | 暂无 | 现有仓库未发现调用方。 |
| commentOnNote | 暂无 | 现有仓库未发现调用方。 |
| deleteNote | 暂无 | 现有仓库未发现调用方。 |

## 协议形态与依赖

- 当前调用协议：`POST { tool, arguments }` 到 `XHS_MCP_ENDPOINT`，返回 JSON。
- 运行模式：`XHS_MCP_MODE=mock|mcp`，默认 `mcp`。
- 超时控制：`XHS_MCP_TIMEOUT_MS`（毫秒）。

## 环境变量清单

- `XHS_MCP_ENDPOINT`：MCP HTTP 端点（mcp 模式必填）。
- `XHS_MCP_TIMEOUT_MS`：请求超时（毫秒）。
- `XHS_MCP_MODE`：`mock` 或 `mcp`。
- `XHS_MCP_TOOL_SEARCH` / `XHS_MCP_TOOL`：search 工具名。
- `XHS_MCP_TOOL_USER_NOTES`：用户笔记工具名。
- `XHS_MCP_TOOL_NOTE_DETAIL`：笔记详情工具名。
- `XHS_MCP_TOOL_PUBLISH`：发布工具名。
- `XHS_MCP_TOOL_COMMENT`：评论工具名。
- `XHS_MCP_TOOL_DELETE`：删除工具名。

## 参考

- `electron/xhsClient.js:64`
- `electron/capture.js:3`
