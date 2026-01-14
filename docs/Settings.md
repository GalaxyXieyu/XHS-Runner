# Settings

## Capture Keywords
Keywords are stored in the Postgres database and can be added, edited, or removed from the UI.

## Capture Frequency
The capture frequency is stored as captureFrequencyMinutes in the settings table.

## Capture Controls
- captureEnabled: enables/disables capture requests
- captureRateLimitMs: minimum delay between capture requests
- captureRetryCount: retry attempts for XHS failures

## Metrics Scope
metricsWindowDays controls the data window (days) for analytics.
Metrics tracked: views, likes, comments, saves, follows.

## XHS Driver Environment
- XHS_MCP_DRIVER=local|mock (default: local). local uses in-process core services.
- XHS_MCP_XSEC_TOKEN: xsec_token required for note detail/comment in local mode.
- XHS_BROWSER_PATH: optional browser executable override for local mode.
- Core is bundled under `electron/mcp/xhs-core/dist`.

## Image Generation (Remote Only)
当前图片生成使用 **Gemini（yunwuapi）** 与 **即梦（火山引擎直连）**。

- Gemini（yunwuapi）
  - `nanobananaEndpoint`: Gemini Base URL（例如 `https://yunwu.ai`）
  - `nanobananaApiKey`: Gemini API Key（例如 `sk-...`）
- 即梦（Jimeng）
  - `volcengineAccessKey`, `volcengineSecretKey`
  - `superbedToken`（上传输入图片到图床）

Env override（用于脚本/冒烟）：
- `NANOBANANA_ENDPOINT` / `NANOBANANA_API_KEY`
- `VOLCENGINE_ACCESS_KEY` / `VOLCENGINE_SECRET_KEY` / `SUPERBED_TOKEN`
