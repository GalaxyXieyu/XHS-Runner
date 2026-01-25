# Supabase 到 PostgreSQL 迁移指南

本指南帮助你将数据从 Supabase 迁移到本地/生产环境的独立 PostgreSQL。

## 📋 迁移概述

```
┌─────────────────┐     导出      ┌─────────────────┐
│   Supabase      │ ──────────→ │  SQL Dump 文件   │
│   (数据源)      │              │  (backups/)     │
└─────────────────┘              └─────────────────┘
                                           │
                                           ▼
┌─────────────────┐     导入      ┌─────────────────┐
│  本地 Docker    │ ←──────────  │  SQL Dump 文件   │
│  PostgreSQL     │              │  (backups/)     │
└─────────────────┘              └─────────────────┘
                                           │
                                           ▼
┌─────────────────┐     导入      ┌─────────────────┐
│ 生产服务器 PG   │ ←──────────  │  SQL Dump 文件   │
│ (独立安装)      │              │  (backups/)     │
└─────────────────┘              └─────────────────┘
```

## 🔧 迁移工具

| 脚本 | 说明 |
|------|------|
| `scripts/migrate-db/export-from-supabase.ts` | 从 Supabase 导出数据 |
| `scripts/migrate-db/import-database.ts` | 导入到 PostgreSQL |
| `scripts/migrate-db/setup-postgres.sh` | 生产服务器 PostgreSQL 配置 |
| `docker-compose.dev.yml` | 本地开发环境 Docker |

## 📝 迁移步骤

### 第 1 步：从 Supabase 导出数据

```bash
# 1. 设置 Supabase 数据库连接（与本地 DATABASE_URL 分开）
export SUPABASE_DB_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"

# 2. 运行导出脚本（也可用 --url= 直接指定）
npx tsx scripts/migrate-db/export-from-supabase.ts

# 3. 导出文件会保存在 backups/ 目录
ls -lh backups/
```

说明：如果你需要与已有本地数据库共用（例如 lagp-pg），保持 `.env.local` 的 `DATABASE_URL` 指向本地数据库即可；导出只依赖 `SUPABASE_DB_URL` 或 `--url=`。

输出示例：
```
🚀 开始从 Supabase 导出数据库...
连接: postgresql://postgres:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres

📋 发现 18 个表: accounts, assets, ...
✅ SQL 文件已生成: backups/supabase-export-2024-01-15.sql
📊 摘要文件已生成: backups/supabase-export-2024-01-15-summary.json
```

### 第 2 步：配置本地 PostgreSQL

#### 方案 A：使用项目提供的 Docker Compose

```bash
# 1. 启动 PostgreSQL 容器
docker-compose -f docker-compose.dev.yml up -d

# 2. 等待数据库就绪
docker-compose -f docker-compose.dev.yml logs -f postgres

# 3. 更新 .env.local
cp .env.example .env.local
# 编辑 DATABASE_URL 为：
# DATABASE_URL=postgresql://xhs_admin:xhs_dev_password@localhost:5432/xhs_generator
```

#### 方案 B：使用你已有的 Docker PostgreSQL

```bash
# 假设你已有的 PostgreSQL 容器名为 my-postgres
# 1. 连接到容器创建数据库
docker exec -it my-postgres psql -U postgres -c "CREATE DATABASE xhs_generator;"

# 2. 创建用户（可选）
docker exec -it my-postgres psql -U postgres -c "CREATE USER xhs_admin WITH PASSWORD 'your_password';"
docker exec -it my-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE xhs_generator TO xhs_admin;"

# 3. 更新 .env.local 的 DATABASE_URL
# DATABASE_URL=postgresql://xhs_admin:your_password@localhost:5432/xhs_generator
```

### 第 3 步：导入数据到本地

```bash
# 使用导出脚本生成的 SQL 文件
npx tsx scripts/migrate-db/import-database.ts \
  --file=backups/supabase-export-2024-01-15.sql
```

输出示例：
```
==========================================
数据库导入工具
==========================================

连接信息:
  主机: localhost:5432
  数据库: xhs_generator
  用户: xhs_admin
  文件: supabase-export-2024-01-15.sql

⚠️  这将覆盖目标数据库中的所有数据！确认继续? (yes/NO): yes

📥 使用 psql 导入数据...
✅ 导入完成

🔍 验证导入结果...

┌─────────────────────────────┬────────┬──────────┐
│ Table                      │ Rows   │ Status   │
├─────────────────────────────┼────────┼──────────┤
│ accounts                   │      1 │ ✅ OK     │
│ assets                     │     79 │ ✅ OK     │
...

总计: 18 个表, 303 行数据
✅ 导入成功完成！
```

### 第 4 步：配置生产服务器

#### 4.1 SSH 连接到服务器

```bash
# 使用之前配置的 SSH
ssh xhs-prod
```

#### 4.2 运行 PostgreSQL 配置脚本

```bash
# 本地执行，脚本会传输到服务器
cat scripts/migrate-db/setup-postgres.sh | ssh xhs-prod "bash -s"
```

或者手动上传：

```bash
# 上传脚本
scp scripts/migrate-db/setup-postgres.sh xhs-prod:/root/

# 远程执行
ssh xhs-prod "chmod +x /root/setup-postgres.sh && /root/setup-postgres.sh"
```

脚本会自动：
- ✅ 安装 PostgreSQL 15
- ✅ 创建数据库 `xhs_generator`
- ✅ 创建用户 `xhs_admin` 和随机密码
- ✅ 配置远程访问
- ✅ 优化配置
- ✅ 显示连接信息

输出示例：
```
==========================================
PostgreSQL 配置完成
==========================================

数据库信息:
  数据库名:    xhs_generator
  用户名:      xhs_admin
  端口:        5432

⚠️  请妥善保存以下密码:
  xhs_prod_aB3dE7fG9hK2mP4qR

将以下配置添加到 .env.production:
  DATABASE_URL=postgresql://xhs_admin:xhs_prod_aB3dE7fG9hK2mP4qR@127.0.0.1:5432/xhs_generator
```

#### 4.3 更新生产环境配置

```bash
# SSH 到服务器
ssh xhs-prod

# 编辑 .env.production
cd /var/www/xhs-generator
nano .env.production

# 更新 DATABASE_URL 为脚本生成的连接字符串
```

#### 4.4 上传并导入数据

```bash
# 本地执行：上传 SQL 文件
scp backups/supabase-export-2024-01-15.sql xhs-prod:/root/

# SSH 到服务器导入数据
ssh xhs-prod
cd /var/www/xhs-generator

# 设置环境变量并导入
export DATABASE_URL="postgresql://xhs_admin:PASSWORD@localhost:5432/xhs_generator"
npx tsx scripts/migrate-db/import-database.ts --file=/root/supabase-export-2024-01-15.sql
```

### 第 5 步：验证迁移

```bash
# 本地验证
npx tsx -e "
import { getDrizzleDb } from './src/server/db';
const db = getDrizzleDb();
const topics = await db.query.topics.findMany();
console.log('✅ 本地数据库正常，找到', topics.length, '条笔记');
"

# 生产环境验证
ssh xhs-prod "cd /var/www/xhs-generator && npx tsx -e \"
import { getDrizzleDb } from './src/server/db';
const db = getDrizzleDb();
const topics = await db.query.topics.findMany();
console.log('✅ 生产数据库正常，找到', topics.length, '条笔记');
\""
```

## 🔄 常见问题

### Q1: 导入时提示 "database is still starting up"

**A:** 等待几秒后重试，PostgreSQL 容器可能还在初始化。

```bash
docker logs -f xhs-postgres  # 查看启动日志
```

### Q2: psql 命令找不到

**A:** 安装 PostgreSQL 客户端工具。

```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# CentOS/RHEL
sudo yum install postgresql
```

### Q3: 连接被拒绝

**A:** 检查以下几点：

1. PostgreSQL 是否在运行：
```bash
docker ps | grep postgres  # 本地
systemctl status postgresql  # 生产
```

2. 端口是否正确：
```bash
netstat -tlnp | grep 5432
```

3. 防火墙是否开放：
```bash
sudo ufw allow 5432  # Ubuntu
sudo firewall-cmd --add-port=5432/tcp --permanent  # CentOS
```

### Q4: 外键约束错误

**A:** 导出脚本已经包含处理外键的 SQL，按照正确顺序导入即可。如果还有问题：

```sql
-- 在导入前执行
SET session_replication_role = 'replica';

-- 导入数据

-- 恢复约束检查
SET session_replication_role = 'origin';
```

## 📊 迁移检查清单

### 本地环境

- [ ] Docker PostgreSQL 已启动
- [ ] .env.local 配置了正确的 DATABASE_URL
- [ ] 从 Supabase 导出数据成功
- [ ] 数据已导入本地数据库
- [ ] 应用可以正常启动并连接数据库
- [ ] 数据完整性验证通过

### 生产环境

- [ ] PostgreSQL 已在生产服务器安装并运行
- [ ] 防火墙规则已配置（如需远程访问）
- [ ] .env.production 配置了正确的 DATABASE_URL
- [ ] 数据已导入生产数据库
- [ ] 应用可以正常启动并连接数据库
- [ ] 数据完整性验证通过
- [ ] 备份策略已制定

## 🗑️ 清理 Supabase 依赖

迁移完成后，运行时已不再依赖 Supabase（仅保留导出脚本）。如不再从 Supabase 导出，可按需清理：

```bash
# 1. 删除导出脚本或移除 SUPABASE_DB_URL（可选）
# 2. 搜索并移除与 Supabase 导出相关的残余引用
rg -n "supabase" scripts/ docs/ MIGRATION.md
```

## 📚 参考资源

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [Docker PostgreSQL 镜像](https://hub.docker.com/_/postgres)
