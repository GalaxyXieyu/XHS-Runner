# Config

Config is stored at userData/config.json.

Defaults:
- updateChannel: stable
- logLevel: info

## XHS Driver Overrides
- XHS_MCP_DRIVER=local|mock controls runtime driver selection (default: local).
- local mode uses bundled core under `electron/mcp/xhs-core/dist`.

## Supabase
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key (public)
- `DATABASE_URL`: Postgres connection string for server-side access
