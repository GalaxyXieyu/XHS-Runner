# 现有调用链与 xhs-mcp 差异清单

## 协议差异
- 现有：`POST { tool, arguments }` 到 `XHS_MCP_ENDPOINT`。
- xhs-mcp：MCP JSON-RPC `initialize` → `tools/list` → `tools/call`。
- HTTP 模式支持 `/mcp`（Streamable HTTP）与 `/sse` + `/messages`（SSE）。

## 工具命名差异（主要映射）

| 现有调用 | 现有工具名 | xhs-mcp 工具名 | 备注 |
| --- | --- | --- | --- |
| fetchTopNotes | xhs_search_note | xhs_search_note | 参数名一致（keyword/count/sort/noteType） |
| fetchUserNotes | xhs_get_user_notes | xhs_get_user_notes | xhs-mcp 要求 xsec_token（部分场景必填） |
| fetchNoteDetail | xhs_get_note_detail | xhs_get_note_detail | xhs-mcp 要求 note_id + xsec_token |
| commentOnNote | xhs_comment_on_note | xhs_comment_on_note | 需补充 xsec_token（若接口要求） |
| publishContent | xhs_publish_content | xhs_publish_content | 入参统一为 type/title/content/media_paths/tags |
| deleteNote | xhs_delete_note | xhs_delete_note | 可能需要 creator center 登录态 |

## 参数与返回差异
- xhs-mcp 部分接口要求 `xsec_token`，现有调用未体现。
- xhs-mcp 返回结构为 JSON-RPC result，对现有 `normalizeNotes` 需做适配。

## 需要改动的调用点
- `electron/xhsClient.js`：改为 JSON-RPC tools/call，并补充 `xsec_token` 流程。
- `docs/Settings.md`：需补充 xhs-mcp 的 `/mcp` 或 `/sse` 端点说明。

## 参考
- `xhs-mcp/README.md:35`
- `xhs-mcp/src/server/mcp.server.ts:46`
- `electron/xhsClient.js:64`
