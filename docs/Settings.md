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
Data window: last 7 days.
Metrics tracked: views, likes, comments, saves, follows.

## MCP Environment
Set XHS_MCP_ENDPOINT to the MCP HTTP endpoint.
Optional: XHS_MCP_MODE=mock to use mock responses during local testing.
