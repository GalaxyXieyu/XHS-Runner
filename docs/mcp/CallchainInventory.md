# xhsClient 调用链清单

## 当前调用入口

- `src/server/services/xhs/capture.ts`：`runCapture` → `fetchWithRetry` → `fetchTopNotes` → `xhsClient.fetchTopNotes`。

## xhsClient 导出函数现状

| 函数 | 当前调用方 | 说明 |
| --- | --- | --- |
| fetchTopNotes | `src/server/services/xhs/capture.ts` | 关键词拉取热门笔记，写入 topics。 |
| fetchUserNotes | 暂无 | 现有仓库未发现调用方。 |
| fetchNoteDetail | 暂无 | 现有仓库未发现调用方。 |
| publishContent | 暂无 | 现有仓库未发现调用方。 |
| commentOnNote | 暂无 | 现有仓库未发现调用方。 |
| deleteNote | 暂无 | 现有仓库未发现调用方。 |

## 运行模式与依赖

- 驱动模式：`XHS_MCP_DRIVER=local|mock`，默认 `local`。
- 内置 core 已打包在 `electron/mcp/xhs-core/dist`。

## 环境变量清单

- `XHS_MCP_DRIVER`：local 或 mock。
- `XHS_MCP_XSEC_TOKEN`：详情/评论所需 token。
- `XHS_BROWSER_PATH`：可选浏览器可执行路径。

## 参考

- `src/server/services/xhs/xhsClient.ts:1`
- `src/server/services/xhs/capture.ts:1`
