#!/usr/bin/env bash
set -euo pipefail

# Create/ensure a local app user for UI E2E.
# Usage:
#   bash scripts/e2e-bootstrap.sh
#   APP_USER_EMAIL=... APP_USER_PASSWORD=... bash scripts/e2e-bootstrap.sh

EMAIL=${APP_USER_EMAIL:-e2e@xhs-runner.local}
PASS=${APP_USER_PASSWORD:-e2e-pass-please-change}

export APP_USER_EMAIL="$EMAIL"
export APP_USER_PASSWORD="$PASS"

npm run auth:bootstrap

echo "[e2e-bootstrap] APP_USER_EMAIL=$EMAIL"
echo "[e2e-bootstrap] APP_USER_PASSWORD=$PASS"
