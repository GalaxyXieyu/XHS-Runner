#!/bin/bash
# Drizzle 数据库初始化脚本
# 此脚本在 Docker PostgreSQL 容器首次启动时自动执行
# 用途：创建主应用数据库并设置权限

set -e

echo "========================================="
echo "初始化 XHS Generator 数据库"
echo "========================================="

# 数据库已由 POSTGRES_DB 环境变量创建
# 这里只需要确保权限正确

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- 确保数据库存在
    SELECT 'Database xhs_generator is ready' AS status;

    -- 授予必要权限
    GRANT ALL PRIVILEGES ON DATABASE xhs_generator TO xhs_admin;

    -- 设置默认权限
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO xhs_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO xhs_admin;
EOSQL

echo "========================================="
echo "XHS Generator 数据库初始化完成"
echo "========================================="
echo ""
echo "注意：表结构将通过 Drizzle 迁移自动创建"
echo "运行方式："
echo "  1. 开发环境：npm run db:push"
echo "  2. 生产环境：npm run db:migrate"
echo ""
