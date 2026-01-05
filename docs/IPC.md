# IPC Channels

## settings:get
Returns the current settings object stored in the local database.

## settings:set
Payload: object of partial settings to update.
Returns the merged settings after persistence.

## keywords:list
Returns the keyword rows ordered by most recent.

## keywords:add
Payload: keyword string.
Creates or re-enables a keyword and returns the row.

## keywords:update
Payload: { id, value, isEnabled }.
Updates the keyword value and enabled flag.

## keywords:remove
Payload: keyword id.
Deletes the keyword.

## capture:run
Payload: { keywordId, limit }.
Triggers capture using XHS MCP settings and returns { status, total, inserted }.

## Availability
These channels are available via the Electron preload bridge as window.settings, window.keywords, and window.capture.
