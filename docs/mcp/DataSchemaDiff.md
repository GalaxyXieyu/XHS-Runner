# 数据结构差异排查（xhs-mcp vs 现有 schema）

## 重点差异概览
- xhs-mcp 的笔记相关工具强依赖 `note_id` + `xsec_token`，现有 topics 中 `xsec_token` 可选但部分流程未贯通。
- 发布接口统一为 `type/title/content/media_paths/tags`，现有 publish_records 使用 `media_urls/tags/content`，字段需映射。
- 评论/互动返回字段不稳定，现有 comments 表缺少作者、时间、状态字段。

## 实体差异清单

### topics（笔记）
- 现有：`note_id`, `xsec_token`(可选), `title`, `desc`, `tags`, `cover_url`, `author_*`, `metrics`。
- xhs-mcp：获取详情/评论时常要求 `note_id` + `xsec_token`。
- 调整建议：确保所有搜索/抓取接口返回并保存 `xsec_token`，并在 UI/调用链中可用。

### publish_records（发布）
- 现有：`type`, `title`, `content`, `tags`, `media_urls`, `scheduled_at`。
- xhs-mcp：`media_paths`（本地路径或 URL），需要区分 `url` 与 `file_path`。
- 调整建议：新增 `media_paths_json` 或在 `media_urls` 中区分来源；保留原始请求 payload。

### creatives / creative_assets
- 现有：`creatives` 无 `type` 字段；前端有 article/image/video。
- xhs-mcp：发布时必须指定 `type`。
- 调整建议：在 `creatives` 增加 `type` 或在 `creative_assets` 记录类型并映射。

### comments
- 现有：`content`, `likes`, `sentiment`。
- xhs-mcp：评论列表通常包含作者、时间、回复状态。
- 调整建议：补充 `author_id`, `author_name`, `created_at`, `reply_status`。

### accounts
- 现有：`auth_json`, `auth_type`。
- xhs-mcp：登录状态由浏览器/ cookie 管理，需保存 `cookie`/`session` 元信息。
- 调整建议：明确 auth_json 结构，增加 `auth_status` 与 `expires_at`。

## 迁移影响
- 需要迁移或回填 `xsec_token` 与 `type` 字段。
- 发布记录需要新增字段或统一映射策略。

## 参考
- `data/schema.md:39`
- `xhs-mcp/README.md:35`
