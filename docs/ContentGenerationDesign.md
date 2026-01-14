# 内容生成模式与提示词模板管理设计

## 目标
- 同时满足“即时可用”与“每日自动供给”的内容创作需求。
- 通过主题配置与提示词模板管理，保证生成内容的可控性与可复用性。
- 对抓取数据进行聚合与压缩，避免上下文爆炸。

## 两种生成模式
### 1) 手动主题模式（即时）
- 用户输入主题或关键词。
- 系统基于主题配置 + 最近抓取数据生成 1 组或多组内容包。
- 用于“今天就要发”的场景。

### 2) 每日自动模式（定时）
- 由定时任务触发（例如每天 09:00）。
- 基于主题配置 + 近 7/30 天的抓取数据，自动生成 5 组内容包。
- 用于“稳定供给素材池”的场景。

## 内容包输出结构（建议）
内容包用于统一承载“可发布内容”的最小单元：
- 标题候选
- 正文/脚本
- 标签
- 封面图提示词（或封面图资产）
- 参考样本（source_topic_ids）
- 推荐理由（rationale_json）

## 主题配置（核心）
主题配置决定生成方向，建议以 JSON 形式保存：

```json
{
  "goal": "collects",
  "persona": "25-35岁职场女性，追求实用与高效",
  "tone": "干货/亲和",
  "contentTypes": ["清单", "教程", "对比"],
  "forbiddenTags": ["医疗", "博彩"],
  "styleRefs": ["@账号A", "@账号B"],
  "dailyOutputCount": 5,
  "minQualityScore": 70,
  "promptProfileId": 3
}
```

字段说明：
- `goal`：收藏优先/评论优先/涨粉优先，影响排序与内容风格。
- `persona`：核心受众画像，用于限定表达方式与痛点。
- `tone`：统一语气，避免风格漂移。
- `contentTypes`：结构偏好，提升一致性。
- `forbiddenTags`：禁区控制，避免跑偏或触碰敏感。
- `promptProfileId`：绑定提示词模板。

## 提示词模板管理（Prompt Profiles）
提示词模板需要可配置、可选择、可复用。

### 模板结构（建议字段）
```json
{
  "name": "通用图文-收藏优先",
  "systemPrompt": "你是小红书内容策略师...",
  "userTemplate": "主题：{{theme}}\n受众：{{persona}}\n语气：{{tone}}\n内容结构：{{contentType}}\n热门标签：{{tags}}\n爆款标题：{{topTitles}}\n样本摘要：{{summaries}}\n\n请输出：标题+正文+标签+封面提示词。",
  "model": "gpt-4.1-mini",
  "temperature": 0.7,
  "maxTokens": 800
}
```

### 可用变量（建议）
- `{{theme}}` `{{persona}}` `{{tone}}` `{{contentType}}`
- `{{tags}}` `{{topTitles}}` `{{summaries}}`
- `{{goal}}` `{{forbiddenTags}}`

### 模板选择策略
- **默认模板**：主题级别绑定。
- **手动模式**：允许临时选择模板（不改变默认）。
- **自动模式**：只使用主题绑定的模板，确保稳定性。
- **版本管理**：新增模板时保留旧版本，便于回滚。

## 数据结构建议（两种方案）
### 方案A：轻改动（推荐快速落地）
- 在 `themes` 表新增 `config_json` 字段。
- 模板存 `prompt_profiles` 表或单独 JSON 文件。

示例（themes 增字段）：
```sql
ALTER TABLE themes ADD COLUMN config_json TEXT;
```

### 方案B：可扩展方案
新增两张表：

```sql
CREATE TABLE IF NOT EXISTS theme_configs (
  theme_id INTEGER PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(theme_id) REFERENCES themes(id)
);

CREATE TABLE IF NOT EXISTS prompt_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_template TEXT NOT NULL,
  model TEXT,
  temperature REAL,
  max_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

优点：可独立维护模板、做版本和权限管理。

## 生成流程（核心逻辑）
### Step 1: 数据过滤
- 时间窗：近 7/30 天。
- 去重：相同 `note_id` 或 `title` 只保留互动最高。
- 过滤：缺标题/互动过低/不符合主题关键词。

### Step 2: 评分排序
评分建议：
```
score = (like + collect*2 + comment*3) * freshness * trendBoost
```

### Step 3: 聚类分组（保证多样性）
- 按标签/关键词聚类。
- 每个簇取 top K，避免 5 个候选同质化。

### Step 4: 摘要压缩
- 每个簇仅保留：
  - topTitles 5条
  - topTags 5-8个
  - bestNotes 3条（每条一行摘要）

### Step 5: 生成内容包
- 输入：主题配置 + 该簇压缩摘要 + 模板。
- 输出：标题、正文、标签、封面提示词、参考样本。

## 上下文控制策略（防爆）
- **先聚合再生成**：不要直接喂原始抓取数据。
- **每次只生成一个簇**：避免上下文过大。
- **固定摘要格式**：每条样本只允许 1 行。
- **强制去重**：避免模型复写原文。

建议的摘要模板（单簇输入）：
```
主题：{{theme}}
目标：{{goal}}
受众：{{persona}}
语气：{{tone}}

热门标签：#A #B #C #D #E
爆款标题：
1. ...
2. ...
3. ...
4. ...
5. ...

样本摘要（每条一行）：
- 标题 | 关键角度 | 高互动原因
- 标题 | 关键角度 | 高互动原因
- 标题 | 关键角度 | 高互动原因
```

## 质量与多样性
- 质量阈值：`minQualityScore` 可控制输出门槛。
- 覆盖面：5 个内容包来自不同簇。
- 可编辑性：默认状态 `draft`，通过审核后 `ready`。

## 每日自动生成的调度
- 复用 `scheduled_jobs`，新增 `job_type = daily_generate`。
- `params_json` 中指定 `theme_id` 和 `output_count`。
- 失败重试使用 `job_executions` 表记录。

## 图文生成模型接入（Nanobanana + 即梦）
目标：在生成内容包时支持两种图像模型，按配置切换或并行生成。

### Nanobanana（现有 XHS-Runner 实现）
调用方式（当前）：`src/server/services/xhs/nanobananaClient.ts`
- 环境变量：
  - `NANOBANANA_ENDPOINT`: 远程 HTTP 端点（必需）
  - `NANOBANANA_API_KEY`: 可选鉴权 key（如服务需要）
- 请求：`POST { endpoint }`，Body 为 `{ prompt }`
- 响应：`{ text, image_base64 }`
- 输出：`text` + `imageBuffer` + `metadata.mode`

### 即梦（迁移自 ai-images-generated）
来源路径：`/Users/galaxyxieyu/Documents/Coding/ai-images-generated/src/lib/image-processor`

核心调用链：
- `providers/jimeng.ts`: 即梦 API 调用与重试逻辑
- `utils/volcengine-signature.ts`: 火山引擎签名
- `utils/api-client.ts`: 带超时/重试的 POST JSON
- `utils/jimeng-lock.ts`: 全局串行锁 + 429 冷却
- `superbed-upload.ts`: 图床上传（将 base64 转公网 URL）

即梦 API 关键参数（背景替换）：
- API: `https://visual.volcengineapi.com/?Action=CVProcess&Version=2022-08-31`
- Body: `req_key = jimeng_t2i_v40`, `prompt`, `image_urls`, `width`, `height`
- 返回：`data.binary_data_base64[0]`（转为 `data:image/jpeg;base64,...`）

### 必需配置（建议纳入设置 UI）
- 火山引擎：`volcengineAccessKey`, `volcengineSecretKey`
- 图床：`superbedToken`（即梦上传图片用）
- Nanobanana：`nanobananaEndpoint`
- 可选：`nanobananaApiKey`（若后端需要鉴权）

### 接口适配建议
统一图像生成输出结构：
```
{
  text: string,
  imageBase64: string,
  metadata: { model: 'nanobanana' | 'jimeng', ... }
}
```
即梦输出需从 `data:image/jpeg;base64,...` 转为 base64 或 buffer；Nanobanana 按现有输出适配即可。

### 集成步骤（迁移计划）
1) 迁移即梦相关实现到 XHS-Runner（服务端）：
   - `providers/jimeng.ts`（即梦 API 调用）
   - `utils/volcengine-signature.ts`（签名）
   - `utils/api-client.ts`（POST JSON + 重试）
   - `utils/jimeng-lock.ts`（串行锁 + 冷却）
   - `superbed-upload.ts`（base64 → 图床 URL）
2) 在 XHS-Runner 新增统一 Image Provider 层：
   - `ImageProvider = nanobanana | jimeng`
   - `generateImage({ prompt, model, images? })` 返回统一结构
3) 生成队列调用统一接口：
   - 内容包生成时按主题配置选择模型
   - 生成图片写入 `assets` 并关联 `creatives`
4) 设置与密钥配置接入：
   - Settings 表新增字段或复用 settings key
   - 设置页提供火山引擎、图床、Nanobanana 配置入口
5) 错误处理与降级：
   - 即梦调用失败时写入错误信息并保留文本内容
   - Nanobanana endpoint 不可用时跳过图片生成或标记失败（按业务选择）

### 配置映射建议（settings key）
建议在 `settings` 表中新增以下 key：
- `volcengineAccessKey`
- `volcengineSecretKey`
- `superbedToken`
- `nanobananaEndpoint`
- `nanobananaApiKey`（可选）

## UI/配置建议
- 主题编辑页新增“内容生成配置”模块。
- 提示词模板管理页：新增/编辑/复制/绑定主题。
- 生成结果页：展示 5 个内容包，可一键选用或编辑。
- 设置页新增“图像模型配置”：火山引擎、图床、Nanobanana 相关配置。

## Graphiti 预留接口（后续 Docker 启动）
当前不引入 GraphRAG/Graphiti，先预留接口抽象，避免后续大改：

### 接口层抽象（建议）
- `KnowledgeProvider`：统一知识检索入口
  - `summarize(themeId, windowDays): SummaryPayload`
  - `search(themeId, query, limit): SearchResult[]`
- 默认实现：`LocalSummaryProvider`（基于 SQLite 聚合）
- 预留实现：`GraphitiProvider`（通过 HTTP 调用 Graphiti 服务）

### 数据契约（SummaryPayload）
```json
{
  "theme": "主题名称",
  "goal": "collects",
  "tags": ["#A", "#B", "#C", "#D", "#E"],
  "topTitles": [
    "标题1",
    "标题2",
    "标题3",
    "标题4",
    "标题5"
  ],
  "summaries": [
    "标题 | 关键角度 | 高互动原因",
    "标题 | 关键角度 | 高互动原因",
    "标题 | 关键角度 | 高互动原因"
  ]
}
```

### Graphiti Provider 预期（后续）
- 运行方式：Docker 启动 Graphiti Server 或 MCP Server
- 连接方式：HTTP（例如 `http://localhost:8000`）
- 输入：主题描述 + 查询条件
- 输出：子图摘要（映射到 SummaryPayload）

## 里程碑建议
1. 先落地主题配置 + 模板管理（手动模式跑通）。
2. 落地每日定时生成（自动模式跑通）。
3. 迭代聚类与评分逻辑，优化质量。
4. 引入 Graphiti Provider（Docker 化）替换部分检索。
