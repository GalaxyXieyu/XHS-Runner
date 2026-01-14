---
mode: contract
project: xhs-generator
created_at: 2026-01-14
---

# Idea 一键生成：最小契约与边界（v1）

本文档用于约束 **Idea → prompts 预览 → 确认入队 → creative 内容包** 的最小闭环，目标是让前后端在“不引入主题/镜头/agent 规划”的前提下可稳定协作。

## 1. 术语与对象

- **idea**：用户的一句话输入（灵感/主题/概念），用于生成多张图的 prompts。
- **prompt**：单张图的生成描述（字符串）。
- **creative**：一次生成会话的聚合对象，承载 tasks / assets。
- **task**：单个 prompt 的生成任务（队列中的一条任务）。
- **asset**：图片文件（由 task 产出，并与 creative 关联）。

## 2. 状态与 UI 映射（建议）

> 后端目前以 `tasks[].status` 为真相源（`queued|running|done|failed`）。`creatives.status` 可作为粗粒度展示，但 UI 以 tasks 为准。

| UI 状态 | 触发条件 | UI 行为 |
|---|---|---|
| idle | 未预览/未编辑 | 可输入 idea、选择风格/比例/数量 |
| previewing | 调用 preview 中 | 禁用预览按钮、显示 loading |
| editable | preview 成功或手动添加 prompts | 允许编辑/排序/删除/新增 prompts |
| confirming | confirm 弹窗确认中 | 禁用确认入队按钮，防重复提交 |
| generating | confirm 返回 creativeId/taskIds | 轮询 creatives/:id 展示进度与图片 |
| finished | 所有 tasks ∈ {done, failed} | 停止轮询；提示“全部完成/部分失败” |

## 3. API 契约

### 3.1 `POST /api/generate/preview`

用于从 idea 生成 N 条 prompts（可编辑）。

**输入**

```json
{
  "idea": "秋天的咖啡馆",
  "goal": "collects",
  "persona": "25-35岁职场女性，追求实用与高效",
  "tone": "干货/亲和",
  "extraRequirements": "不要出现品牌logo；避免手部特写",
  "styleKey": "cozy",
  "aspectRatio": "3:4",
  "count": 4
}
```

- `idea`：必填，`trim()` 后不能为空
- `goal`：可选，枚举值：`collects` / `comments` / `followers`
- `persona`：可选，目标受众画像（字符串）
- `tone`：可选，语气偏好（字符串）
- `extraRequirements`：可选，额外约束（字符串）
- `styleKey`：可选，若不存在会降级为默认模板
- `aspectRatio`：可选，枚举值：`3:4` / `1:1` / `4:3`
- `count`：可选，整数；服务端裁剪到 `1..9`

**输出（200）**

```json
{
  "prompts": ["..."],
  "styleTemplate": { "key": "cozy", "name": "温馨治愈", "category": "lifestyle" },
  "canEdit": true
}
```

**错误**

- 400：`{ "error": "IDEA_PREVIEW_BAD_REQUEST: ..." }`
- 500：`{ "error": "IDEA_PREVIEW_INTERNAL: ..." }`

### 3.2 `POST /api/generate/confirm`

用于将 prompts 入队生成，返回 `creativeId` 与 `taskIds`。

**输入**

```json
{
  "prompts": ["p1", "p2"],
  "model": "nanobanana",
  "themeId": null
}
```

- `prompts`：必填数组；服务端会 `trim + filter(Boolean) + slice(0,9)`
- `model`：可选，枚举值：`nanobanana` / `jimeng`
- `themeId`：可选，数字（Idea 一键生成默认不依赖 theme）

**输出（200）**

```json
{
  "creativeId": 123,
  "taskIds": [1,2,3],
  "status": "queued"
}
```

**错误**

- 400：`{ "error": "IDEA_CONFIRM_BAD_REQUEST: ..." }`
- 409：模板 key 冲突等（如后续扩展）
- 500：`{ "error": "IDEA_CONFIRM_INTERNAL: ..." }`

### 3.3 `GET /api/creatives/:id`

用于轮询 creative 聚合视图（tasks/assets）。

**输入**

- `id`：必填数字

**输出（200）**

```json
{
  "creative": { "id": 123, "status": "generating", "...": "..." },
  "tasks": [{ "id": 1, "status": "queued|running|done|failed", "...": "..." }],
  "assets": [{ "id": 10, "type": "image", "path": "...", "...": "..." }]
}
```

**错误**

- 400：`{ "error": "Invalid id" }`
- 404：`{ "error": "Creative not found" }`
- 500：`{ "error": "<message>" }`

### 3.4 `GET /api/assets/:id`

用于加载图片内容。

**输出（200）**

- 返回图片二进制流（`Content-Type` 由扩展名推断）

**错误**

- 400/403/404/500：`{ "error": "<message>" }`

## 4. 兼容性与安全边界

- **不得在日志/返回中输出任何密钥**（包括 `sk-...`、access_key、token 等）。
- `error` 字段保持字符串，便于 UI 直接展示；建议使用前缀便于定位来源（例如 `IDEA_PREVIEW_*`）。
- UI 不应依赖 `systemPrompt` 等敏感字段；风格模板列表 API 仅返回可枚举元信息。
