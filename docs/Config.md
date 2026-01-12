# Config

Config is stored at userData/config.json.

Defaults:
- updateChannel: stable
- logLevel: info

## XHS Driver Overrides
- XHS_MCP_DRIVER=local|mock controls runtime driver selection (default: local).
- local mode requires `npm run build:xhs-core`.

## Supabase
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key (public)
- `XHS_DB_PROVIDER=supabase|sqlite`: choose DB backend (default: `supabase`)
