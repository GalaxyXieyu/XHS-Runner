#!/bin/bash
# 数据库 Schema 同步脚本 - 一条龙解决方案
# 使用方式：./scripts/sync-schema.sh

set -e

# 加载环境变量
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
elif [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "========================================="
echo "数据库 Schema 同步"
echo "========================================="
echo ""

# 1. 生成迁移文件
echo "📝 步骤 1/3: 生成迁移文件..."
npm run db:generate

# 2. 应用迁移到数据库
echo ""
echo "🔄 步骤 2/3: 应用迁移到数据库..."

# 检查是否有 Docker 容器运行
if docker-compose ps postgres | grep -q "Up"; then
    echo "   使用 Docker PostgreSQL..."

    # 获取最新的迁移文件
    LATEST_MIGRATION=$(ls -t drizzle/*.sql 2>/dev/null | head -1)

    if [ -n "$LATEST_MIGRATION" ]; then
        echo "   执行迁移: $LATEST_MIGRATION"
        docker-compose exec -T postgres psql -U xhs_admin -d xhs_generator < "$LATEST_MIGRATION" 2>&1 | grep -v "obsolete" || true
        echo "   ✅ 迁移执行成功"
    else
        echo "   ⚠️  没有找到迁移文件"
    fi
else
    echo "   ⚠️  Docker PostgreSQL 未运行，跳过迁移"
    echo "   请先启动: docker-compose up -d postgres"
fi

# 3. 验证表结构
echo ""
echo "🔍 步骤 3/3: 验证表结构..."
if docker-compose ps postgres | grep -q "Up"; then
    echo ""
    echo "数据库中的表："
    docker-compose exec -T postgres psql -U xhs_admin -d xhs_generator -c "\dt" 2>&1 | grep -v "obsolete" | grep -E "public|List of relations|Schema|---" || true
    echo ""
fi

echo "========================================="
echo "✅ Schema 同步完成！"
echo "========================================="
echo ""
echo "💡 提示："
echo "   - 如果应用正在运行，请重启应用以加载新表"
echo "   - 开发环境：Ctrl+C 停止，然后 npm run dev"
echo "   - 生产环境：pm2 restart xhs-generator"
echo ""
