# MCP 调用边界与封装规范

## 目标
统一 MCP 工具调用方式、超时与降级策略，保证接口层可控、可追踪、可回放。

## 调用边界
- 所有 MCP 调用必须通过统一封装层（xhsClient），禁止在业务层直接请求 MCP。
- 业务接口只处理已归一化的数据结构，原始响应需保留在 raw_json 字段。

## 工具映射（建议）
- 搜索笔记：xhs_search_note
- 用户笔记：xhs_get_user_notes
- 笔记详情：xhs_get_note_detail
- 发表评论：xhs_comment_on_note
- 发布笔记：xhs_publish_content
- 删除笔记：xhs_delete_note
- 关注用户：xhs_follow_user
- 点赞/收藏：xhs_like_note / xhs_collect_note

## 超时与降级
- 默认超时：`XHS_MCP_TIMEOUT_MS`，超时即返回 E_TIMEOUT 并记录失败原因。
- 降级策略：
  - mock 模式：`XHS_MCP_MODE=mock` 返回模拟数据，用于前端演示。
  - 真实模式失败时不回退 mock，返回明确错误码供前端提示。

## 错误处理
- MCP 返回非 2xx 时转换为统一错误结构：`E_MCP_FAILURE`。
- 保留原始响应/错误文本用于排查。

## 数据落库建议
- topics.raw_json：保存笔记详情原始响应。
- comments.raw_json：保存评论列表原始响应（如有）。
- publish_records.response_json：保存发布响应。

## 参考
- `electron/xhsClient.js:64`
- `data/schema.md:176`
