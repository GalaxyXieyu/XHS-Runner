# Image Provider Reference Contract (ai-images-generated)

本文件用于把参考项目 `/Volumes/DATABASE/code/business/ai-images-generated` 中 **Gemini / 即梦（Jimeng）** 的调用协议“按可执行契约”落盘，作为本仓库后续实现修正的依据。本文不包含任何真实密钥，仅记录接口格式、边界与错误处理要点。

## 1. 契约范围

- **参考项目调用入口**
  - `ai-images-generated/src/lib/image-processor/service.ts:79`（`processWithGemini` / `processWithJimeng`）
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:24`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:17`
- **本项目对应入口**
  - `src/server/services/xhs/integration/nanobananaClient.ts:87`（当前包含 mock/placeholder 分支）
  - `src/server/services/xhs/integration/imageProvider.ts:323`（`generateImage` 统一入口；`jimeng` 直连火山引擎）

> 说明：参考项目主要实现的是“背景替换”（多模态输入：产品图 + 参考图 + 文本 prompt），本项目当前以“生成图”（prompt-only）为主；但网络协议与鉴权方式仍可复用/对齐。

## 2. Gemini（yunwu.ai / Gemini Native API）

### 2.1 鉴权与 Base URL

- **Base URL**：默认 `https://yunwu.ai`（可配置）
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:38`
- **Header**：`x-goog-api-key: <GEMINI_API_KEY>`
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:61`
- **注意**：参考实现未使用 `Authorization: Bearer ...`，而是使用 `x-goog-api-key`。

### 2.2 Endpoint 与 Model

- **Endpoint 模板**：`POST {baseUrl}/v1beta/models/{modelName}:generateContent`
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:58`
- **Model**：`gemini-3-pro-image-preview`
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:39`

### 2.3 Request Body（Gemini 原生格式）

参考项目请求体（背景替换场景）：

```json
{
  "contents": [
    {
      "parts": [
        { "text": "<prompt>" },
        { "inlineData": { "mimeType": "image/*", "data": "<base64>" } },
        { "inlineData": { "mimeType": "image/*", "data": "<base64>" } }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": { "aspectRatio": "1:1" }
  }
}
```

- `convertToGeminiInlineData(...)` 用于把图片 URL/base64 转成 Gemini `inlineData` 结构
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:45`
- **超时**：`300000ms`（5 分钟）
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:65`

### 2.4 Response（成功）

参考项目从 `candidates[0].content.parts[*].inlineData.data` 提取图片 base64：

- `data.candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData?.data`
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:69`
- 输出为 `data:image/png;base64,{data}`（data URL）
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:74`

### 2.5 错误处理与边界

- **未配置 Key**：抛出 `GEMINI_NOT_CONFIGURED:*`
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:33`
- **未取到图片**：抛出 `未能从 Gemini 响应中提取图片数据`
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:100`
- **降级行为**：若未取到 `inlineData`，尝试从文本中提取图片 URL（正则）
  - `ai-images-generated/src/lib/image-processor/providers/gemini.ts:84`

## 3. 即梦（Jimeng / 火山引擎直连）

### 3.1 前置依赖（图床）

- 即梦背景替换会先把输入图片上传到 Superbed，得到公网 URL 后再调用即梦
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:36`
- `superbedToken` 由上层传入（参考项目从用户配置读取）
  - `ai-images-generated/src/lib/image-processor/service.ts:127`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:24`

### 3.2 鉴权与 Endpoint

- Host：`visual.volcengineapi.com`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:12`
- Endpoint：`POST https://visual.volcengineapi.com/?Action=CVProcess&Version=2022-08-31`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:174`
- 鉴权：火山引擎签名 `Authorization: HMAC-SHA256 Credential=...`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:161`

### 3.3 Request Body

参考项目请求体：

```json
{
  "req_key": "jimeng_t2i_v40",
  "req_json": "{}",
  "prompt": "<prompt>",
  "width": 2048,
  "height": 2048,
  "scale": 0.5,
  "force_single": true,
  "image_urls": ["<superbed_url_1>", "<superbed_url_2>"]
}
```

- `image_urls` 在存在输入图时才传
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:141`

### 3.4 Response（成功）

- 成功条件：`result.code === 10000`，图片数据在 `result.data.binary_data_base64[0]`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:183`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:69`

### 3.5 重试 / 429 冷却策略

- 发生 `code === 50430` 时设置冷却 60 秒，并抛出 `CONCURRENT_LIMIT:*`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:184`
- 可重试错误：`CONCURRENT_LIMIT|429|timeout|ECONNRESET|ETIMEDOUT|500|503|504`（正则/包含判断）
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:204`
- 使用全局锁串行化调用：`jimengApiLock.enqueue(...)`
  - `ai-images-generated/src/lib/image-processor/providers/jimeng.ts:105`

## 4. 本项目落地建议（对齐点）

1. **Gemini**：将 `nanobananaClient.ts` 的远程调用协议从“自定义 {prompt} → {image_base64}”对齐为“Gemini Native generateContent”，至少确认：`baseUrl`、`modelName`、header（`x-goog-api-key`）、response 解析路径。
2. **Jimeng**：本项目现有 `imageProvider.ts` 已接近参考实现，重点对齐：日志脱敏、冷却/重试条件与输出 metadata；并决定是否继续“火山引擎直连”或迁移为“yunwuapi 代理”。

