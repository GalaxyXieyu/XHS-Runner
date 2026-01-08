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
Triggers capture using xhsClient local driver and returns { status, total, inserted }.

## generation:enqueue
Payload: { topicId, prompt, templateKey } or { tasks: [] }.
Enqueues one or more generation tasks and returns created tasks.

## generation:pause
Pauses the generation queue.

## generation:resume
Resumes the generation queue.

## generation:cancel
Payload: task id.
Cancels a queued task.

## generation:stats
Returns { queued, paused, processing } for the generation queue.

## topics:list
Returns the latest topics with allowed status transitions.

## topics:updateStatus
Payload: { id, status }.
Validates and updates the topic workflow state.

## metrics:record
Payload: { publishRecordId, metricKey, metricValue, capturedAt }.
Records a metric snapshot.

## metrics:summary
Payload: { windowDays }.
Returns totals, comparison, and trend for the window.

## metrics:export
Payload: { windowDays }.
Exports metrics CSV to the userData exports directory.

## config:get
Returns the config.json contents.

## config:set
Payload: partial config object.
Persists config.json and returns merged config.

## workflow:publishTopic
Payload: { topicId, platform }.
Creates a publish record for the latest generation task and updates topic status.

## workflow:rollback
Payload: { topicId }.
Cancels queued downstream tasks and marks the topic failed.

## Availability
These channels are available via the Electron preload bridge as window.settings, window.keywords, window.capture, window.generation, window.topics, window.metrics, window.config, and window.workflow.
