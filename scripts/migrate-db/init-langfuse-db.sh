#!/bin/bash
set -e

# 创建 Langfuse 数据库和用户
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- 创建 Langfuse 数据库
    CREATE DATABASE langfuse;

    -- 创建 Langfuse 用户（如果不存在）
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'langfuse') THEN
            CREATE USER langfuse WITH PASSWORD 'langfuse_password';
        END IF;
    END
    \$\$;

    -- 授予权限
    GRANT ALL PRIVILEGES ON DATABASE langfuse TO langfuse;

    -- 切换到 langfuse 数据库并授予 schema 权限
    \c langfuse
    GRANT ALL ON SCHEMA public TO langfuse;
    ALTER DATABASE langfuse OWNER TO langfuse;
EOSQL

echo "✅ Langfuse 数据库创建完成"
