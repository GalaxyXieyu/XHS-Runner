#!/usr/bin/env bash
set -euo pipefail

# Run migrations if DATABASE_URL is set.
if [[ -n "${DATABASE_URL:-}" || -n "${POSTGRES_URL:-}" ]]; then
  echo "[entrypoint] running DB migrations"
  node ./scripts/migrate-db.js
else
  echo "[entrypoint] DATABASE_URL not set; skipping migrations"
fi

echo "[entrypoint] starting Next server"
exec node server.js
