# Database

## Provider Switch
- `XHS_DB_PROVIDER=supabase|sqlite` controls which backend is used (default: `supabase`).
- `sqlite` uses a local file under Electron userData (`xhs-generator.db`).
- `supabase` uses Postgres via Supabase (requires `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

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
