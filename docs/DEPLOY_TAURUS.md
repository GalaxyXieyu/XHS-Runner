# Deploy To Taurus (38.76.197.25)

This repo deploys the web app via Docker Compose to:
- `/root/data/xhs-runner`
- web port: `34124`

## One-time server setup

On Taurus:

```bash
mkdir -p /root/data/xhs-runner/app
# put docker-compose.yml and .env in /root/data/xhs-runner
```

Example `/root/data/xhs-runner/.env`:

```bash
POSTGRES_PASSWORD=...
APP_AUTH_SECRET=...
APP_ADMIN_EMAIL=you@example.com

# Optional Langfuse
# LANGFUSE_PUBLIC_KEY=
# LANGFUSE_SECRET_KEY=
```

## GitHub Actions deploy

Workflow: `.github/workflows/deploy-taurus.yml`

Required GitHub Secrets:
- `TAURUS_HOST` = `38.76.197.25`
- `TAURUS_USER` = `root`
- `TAURUS_SSH_KEY` = private key content for ssh

Push to `main` triggers deploy.

## Manual deploy

From your dev machine:

```bash
rsync -az --delete --exclude node_modules --exclude .next --exclude .git --exclude dist --exclude ".env*" \
  ./ root@38.76.197.25:/root/data/xhs-runner/app/

scp docker-compose.web.prod.yml root@38.76.197.25:/root/data/xhs-runner/docker-compose.yml

ssh root@38.76.197.25 <<'EOF'
set -euo pipefail
cd /root/data/xhs-runner
nohup docker compose --env-file .env build web > build-web.log 2>&1 &
docker compose --env-file .env up -d
EOF
```
