#!/bin/bash
# 使用 pg_dump 从 Supabase 导出数据
# 这是一个更可靠的方式

set -e

# 配置
DB_HOST="db.emfhfxayynshmgkxdccb.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASS="Xieyu120807!!!"

OUTPUT_DIR="./scripts/backups"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S")
OUTPUT_FILE="${OUTPUT_DIR}/supabase-export-${TIMESTAMP}.sql"

echo "🚀 使用 pg_dump 从 Supabase 导出数据..."
echo "连接: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""

# 确保输出目录存在
mkdir -p "${OUTPUT_DIR}"

# 设置 PGPASSWORD 环境变量（避免密码提示）
export PGPASSWORD="${DB_PASS}"

# 使用 pg_dump 导出
# --data-only: 只导出数据，不导出表结构
# --column-inserts: 使用带列名的 INSERT 语句
# --disable-triggers: 禁用触发器
pg_dump \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --dbname="${DB_NAME}" \
    --schema="public" \
    --no-owner \
    --no-acl \
    --table="accounts" \
    --table="assets" \
    --table="agent_prompts" \
    --table="checkpoints" \
    --table="checkpoint_blobs" \
    --table="checkpoint_migrations" \
    --table="checkpoint_writes" \
    --table="competitors" \
    --table="content_type_templates" \
    --table="creative_assets" \
    --table="creatives" \
    --table="extension_services" \
    --table="form_assist_records" \
    --table="generation_tasks" \
    --table="image_download_queue" \
    --table="image_plans" \
    --table="image_style_templates" \
    --table="interaction_tasks" \
    --table="job_executions" \
    --table="keywords" \
    --table="llm_providers" \
    --table="metrics" \
    --table="prompt_profiles" \
    --table="publish_records" \
    --table="rate_limit_state" \
    --table="reference_image_analyses" \
    --table="reference_images" \
    --table="scheduled_jobs" \
    --table="settings" \
    --table="themes" \
    --table="topics" \
    --table="trend_reports" \
    --data-only \
    --column-inserts \
    --disable-triggers > "${OUTPUT_FILE}"

# 清除密码
unset PGPASSWORD

# 检查导出结果
if [ -s "${OUTPUT_FILE}" ]; then
    # 统计 INSERT 语句数量
    INSERT_COUNT=$(grep -c "^INSERT" "${OUTPUT_FILE}" || echo "0")

    # 获取文件大小
    FILE_SIZE=$(du -h "${OUTPUT_FILE}" | cut -f1)

    echo ""
    echo "✅ 导出完成！"
    echo "   文件: ${OUTPUT_FILE}"
    echo "   大小: ${FILE_SIZE}"
    echo "   INSERT 语句: ${INSERT_COUNT}"

    # 显示每个表的行数
    echo ""
    echo "📊 表数据统计:"
    grep "^INSERT INTO public\\." "${OUTPUT_FILE}" | \
        sed 's/INSERT INTO public\.\([^ ]*\).*/\1/' | \
        sort | uniq -c | \
        awk '{printf "   %-30s %5d 行\n", $2, $1}'
else
    echo ""
    echo "❌ 导出失败：文件为空"
    exit 1
fi
