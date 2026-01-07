# 关键接口测试用例清单

## 鉴权
- 未登录访问主题列表应返回 E_AUTH_REQUIRED。
- 低权限访问发布接口应返回 E_FORBIDDEN。

## 主题/关键词
- 新建主题成功，返回 id。
- 更新主题状态为 paused 生效。
- 关键词列表按 theme_id 聚合。

## 洞察/话题
- topics:list 支持 limit 与分页。
- insights:get 返回 top_tags/title_patterns。

## 内容创作
- creatives:create 创建草稿，状态为 draft。
- creativeAssets:add 成功绑定素材。

## 发布
- publish:enqueue 生成 queued 记录。
- publish:status 更新为 published。

## 互动/评论
- comments:reply 成功返回 replied。
- interactions:enqueue 生成 auto_reply 任务。

## MCP 降级
- MCP 失败时返回 E_MCP_FAILURE，raw_json 记录异常。
