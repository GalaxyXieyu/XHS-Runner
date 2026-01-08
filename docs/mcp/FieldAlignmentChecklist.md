# 字段对齐清单（localService → xhsClient → topics）

## 抓取链路（searchFeeds / fetchTopNotes）
- note_id：`item.id` / `noteCard.noteId` → `topics.source_id` + `topics.note_id`
- xsec_token：`item.xsecToken` / `noteCard.xsecToken` → `topics.xsec_token`
- title：`noteCard.displayTitle` → `topics.title`
- desc：`noteCard.desc` → `topics.desc`
- note_type：`noteCard.type` → `topics.note_type`
- tags：`noteCard.tagList` / `noteCard.tags` → `topics.tags`（JSON 字符串）
- cover_url：`noteCard.cover.urlDefault` → `topics.cover_url`
- media_urls：`noteCard.imageList[*].infoList[*].url` → `topics.media_urls`（JSON 字符串）
- author_*：`noteCard.user.{userId,nickname,avatar}` → `topics.author_id/author_name/author_avatar_url`
- interact：`noteCard.interactInfo` → `topics.like_count/collect_count/comment_count/share_count`
- published_at：`noteCard.cornerTagInfo[type=publish_time].text` → `topics.published_at`
- raw_json：完整原始 item → `topics.raw_json`

## 详情链路（getFeedDetail / fetchNoteDetail）
- detail 来源：`noteDetailMap[feedId]`（含 `noteCard`）
- 字段映射：复用抓取链路映射规则，确保 `xsec_token` 可用
- comments：原始 comments 列表 → 返回值 `comments`

## 发布 / 互动链路（publish/comment/delete）
- publishContent 返回 `noteId` → 预留写入 `publish_records.note_id`
- comment/delete 使用 `note_id + xsec_token`，与抓取保存字段一致

## 参考
- `src/server/services/xhs/xhsClient.ts:1`
- `src/server/services/xhs/capture.ts:1`
- `src/server/db.ts:1`
