# Database

## Provider
- Postgres via Drizzle ORM.
- Configure one of: `DATABASE_URL` / `POSTGRES_URL` / `SUPABASE_DB_URL`.
  - Example: `DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>`

## Supabase (可选)
- 客户端只需：`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 服务端仍使用 `DATABASE_URL` 连接 Postgres

## Schema
- keywords: configured keyword list and enable flags
- topics: captured topics per keyword
- topics.status: workflow state (captured/generating/reviewing/approved/published/analyzed/failed)
- assets: generated images or content assets
- generation_tasks: generation jobs and status
- publish_records: publish attempts and status
- metrics: per-post metrics snapshots
- settings: key/value storage for capture frequency and other settings
