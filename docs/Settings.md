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
Set XHS_MCP_ENDPOINT to the MCP HTTP endpoint.
Optional: XHS_MCP_MODE=mock to use mock responses during local testing.

Tool overrides (optional):
- XHS_MCP_TOOL_SEARCH (default: xhs_search_note)
- XHS_MCP_TOOL_USER_NOTES (default: xhs_get_user_notes)
- XHS_MCP_TOOL_NOTE_DETAIL (default: xhs_get_note_detail)
- XHS_MCP_TOOL_PUBLISH (default: xhs_publish_content)
- XHS_MCP_TOOL_COMMENT (default: xhs_comment_on_note)
- XHS_MCP_TOOL_DELETE (default: xhs_delete_note)
