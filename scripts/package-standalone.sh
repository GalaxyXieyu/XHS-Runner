#!/bin/bash

# 打包 Next.js standalone 产物（用于低配置服务器部署）

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist"
ARTIFACT="${OUT_DIR}/xhs-generator-standalone.tar.gz"

mkdir -p "$OUT_DIR"

echo "🧱 Building Next.js (standalone)..."
pnpm build

if [ ! -d "${ROOT_DIR}/.next/standalone" ]; then
  echo "❌ 未生成 .next/standalone，请确认 next.config.js 已配置 output: 'standalone'"
  exit 1
fi

INCLUDES=(
  ".next/standalone"
  ".next/static"
  "ecosystem.config.js"
)

if [ -d "${ROOT_DIR}/public" ]; then
  INCLUDES+=("public")
fi

echo "📦 Packaging artifact: ${ARTIFACT}"
tar -czf "$ARTIFACT" -C "$ROOT_DIR" "${INCLUDES[@]}"

echo "✅ 打包完成: ${ARTIFACT}"
