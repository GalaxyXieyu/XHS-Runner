# Local Database

## Location
The database is stored under the Electron userData directory as xhs-generator.db.
A backup copy is written as xhs-generator.db.bak by default when invoking the backup helper.

## Schema
- keywords: configured keyword list and enable flags
- topics: captured topics per keyword
- topics.status: workflow state (captured/generating/reviewing/approved/published/analyzed/failed)
- assets: generated images or content assets
- generation_tasks: generation jobs and status
- publish_records: publish attempts and status
- metrics: per-post metrics snapshots
- settings: key/value storage for capture frequency and other settings
