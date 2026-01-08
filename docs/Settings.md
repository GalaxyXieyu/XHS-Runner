# Settings

## Capture Keywords
Keywords are stored in the local database and can be added, edited, or removed from the UI.

## Capture Frequency
The capture frequency is stored as captureFrequencyMinutes in the settings table.

## Capture Controls
- captureEnabled: enables/disables capture requests
- captureRateLimitMs: minimum delay between capture requests
- captureRetryCount: retry attempts for MCP failures

## Metrics Scope
metricsWindowDays controls the data window (days) for analytics.
Metrics tracked: views, likes, comments, saves, follows.

## MCP Environment
- XHS_MCP_DRIVER=local|mock (default: local). local uses in-process core services.
- XHS_MCP_XSEC_TOKEN: xsec_token required for note detail/comment in local mode.
- XHS_BROWSER_PATH: optional browser executable override for local mode.
- Build core before running: `npm run build:xhs-core`.
