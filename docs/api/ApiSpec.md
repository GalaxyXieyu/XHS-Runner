# 接口规格文档（核心接口）

## 统一响应结构
```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

错误示例：
```json
{
  "ok": false,
  "error": {
    "code": "E_AUTH_REQUIRED",
    "message": "login required"
  }
}
```

## Themes
### themes:list
请求：
```json
{ "status": "active" }
```
响应：
```json
{ "ok": true, "data": { "items": [ { "id": "t1", "name": "夏季防晒", "status": "active" } ] } }
```

### themes:create
请求：
```json
{ "name": "夏季防晒", "description": "...", "status": "active" }
```
响应：
```json
{ "ok": true, "data": { "id": "t1" } }
```

## Keywords
### keywords:list
请求：
```json
{ "theme_id": "t1" }
```
响应：
```json
{ "ok": true, "data": { "items": [ { "id": "k1", "keyword": "防晒" } ] } }
```

## Insights
### insights:get
请求：
```json
{ "theme_id": "t1" }
```
响应：
```json
{ "ok": true, "data": { "top_tags": ["#防晒"], "title_patterns": [] } }
```

## Topics
### topics:list
请求：
```json
{ "theme_id": "t1", "limit": 20 }
```
响应：
```json
{ "ok": true, "data": { "items": [ { "note_id": "n1", "title": "...", "tags": ["#防晒"] } ] } }
```

## Publish
### publish:enqueue
请求：
```json
{ "theme_id": "t1", "creative_id": "c1", "scheduled_at": "2026-01-08 10:00" }
```
响应：
```json
{ "ok": true, "data": { "id": "p1", "status": "queued" } }
```

## Comments
### comments:reply
请求：
```json
{ "comment_id": "c1", "content": "感谢支持" }
```
响应：
```json
{ "ok": true, "data": { "status": "replied" } }
```

## 错误码
- E_AUTH_REQUIRED：未登录
- E_FORBIDDEN：无权限
- E_VALIDATION：参数校验失败
- E_MCP_FAILURE：MCP 调用失败
- E_DB_FAILURE：存储失败
