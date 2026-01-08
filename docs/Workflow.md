# Workflow States

## Topic States
- captured → generating → reviewing → approved → published → analyzed
- failed can transition back to captured

## State Transitions
Transitions are enforced in src/server/services/xhs/workflow.ts and validated when updating topic status.

## Rollback
Rollback cancels queued generation tasks, cancels publish records, and marks the topic as failed.
