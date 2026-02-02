# 数据库 Schema 管理指南

## 概述

本项目使用 **Drizzle ORM** 作为数据库 Schema 的单一数据源（Single Source of Truth）。所有数据库表结构定义在 TypeScript 代码中，通过 Drizzle Kit 自动生成 SQL 迁移文件。

## 核心原则

1. **Schema 即代码**：所有表结构定义在 `src/server/db/schema.ts`
2. **类型安全**：TypeScript 提供完整的类型检查
3. **迁移驱动**：通过迁移文件管理数据库变更
4. **版本控制**：迁移文件纳入 Git 版本管理

## 文件结构

```
xhs-generator/
├── src/server/db/
│   ├── schema.ts           # 数据库 Schema 定义（单一数据源）
│   └── index.ts            # 数据库连接配置
├── drizzle/                # 迁移文件目录
│   ├── 0000_*.sql          # 初始 Schema
│   ├── 0001_*.sql          # 迁移 1
│   ├── 0002_*.sql          # 迁移 2
│   └── meta/               # 迁移元数据
│       └── _journal.json   # 迁移历史记录
├── scripts/
│   └── migrate-db.ts       # 迁移执行脚本
└── drizzle.config.ts       # Drizzle Kit 配置
```

## 工作流程

### 1. 修改 Schema

编辑 `src/server/db/schema.ts` 文件：

```typescript
// 示例：添加新表
export const agentPrompts = pgTable('agent_prompts', {
  id: serial('id').primaryKey(),
  agentName: text('agent_name').notNull().unique(),
  systemPrompt: text('system_prompt').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 示例：修改现有表
export const themes = pgTable('themes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  // 新增字段
  priority: integer('priority').default(0),
  analytics: jsonb('analytics_json'),
  config: jsonb('config_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2. 生成迁移文件

```bash
npm run db:generate
```

这会：
- 对比当前 Schema 和数据库状态
- 生成新的 SQL 迁移文件到 `drizzle/` 目录
- 更新 `drizzle/meta/_journal.json`

### 3. 应用迁移

#### 开发环境（推荐）

```bash
# 直接推送 Schema 变更到数据库（不生成迁移文件）
npm run db:push
```

#### 生产环境

```bash
# 执行所有待应用的迁移
npm run db:migrate
```

### 4. 查看数据库

```bash
# 启动 Drizzle Studio（可视化数据库管理工具）
npm run db:studio
```

访问 `https://local.drizzle.studio` 查看和编辑数据。

## Docker 环境初始化

### 首次启动

```bash
# 1. 启动 Docker 容器
docker-compose up -d

# 2. 等待 PostgreSQL 就绪
docker-compose ps

# 3. 运行迁移
npm run db:migrate
```

### 自动化初始化（推荐）

在 `docker-compose.yml` 中添加应用服务：

```yaml
services:
  app:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://xhs_admin:xhs_dev_password@postgres:5432/xhs_generator
    command: sh -c "npm run db:migrate && npm start"
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run db:generate` | 生成新的迁移文件 |
| `npm run db:migrate` | 执行待应用的迁移 |
| `npm run db:push` | 直接推送 Schema 变更（开发环境） |
| `npm run db:studio` | 启动 Drizzle Studio |

## 最佳实践

### 1. Schema 变更流程

```
修改 schema.ts → 生成迁移 → 测试迁移 → 提交代码
```

### 2. 开发环境 vs 生产环境

- **开发环境**：使用 `db:push` 快速迭代
- **生产环境**：使用 `db:migrate` 确保可追溯

### 3. 迁移文件管理

- ✅ 提交所有迁移文件到 Git
- ✅ 迁移文件只增不改
- ❌ 不要手动编辑已应用的迁移
- ❌ 不要删除已应用的迁移

### 4. 团队协作

1. 拉取最新代码后，先运行 `npm run db:migrate`
2. 修改 Schema 后，立即生成迁移并提交
3. 遇到迁移冲突时，协调解决后重新生成

## 故障排查

### 迁移失败

```bash
# 查看数据库状态
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "\dt"

# 查看迁移历史
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "SELECT * FROM drizzle.__drizzle_migrations"

# 手动回滚（谨慎使用）
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "DELETE FROM drizzle.__drizzle_migrations WHERE id = 'xxx'"
```

### Schema 不同步

```bash
# 重置开发数据库（会丢失数据）
docker-compose down -v
docker-compose up -d
npm run db:migrate
```

### 查看 SQL 差异

```bash
# 生成迁移但不应用
npm run db:generate

# 查看生成的 SQL
cat drizzle/0004_*.sql
```

## 示例：添加新表

### 1. 定义 Schema

```typescript
// src/server/db/schema.ts
export const agentPrompts = pgTable('agent_prompts', {
  id: serial('id').primaryKey(),
  agentName: text('agent_name').notNull().unique(),
  systemPrompt: text('system_prompt').notNull(),
  userPrompt: text('user_prompt'),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2. 生成迁移

```bash
npm run db:generate
```

输出：
```
✔ Generating migrations...
✔ Generated migration: drizzle/0004_agent_prompts.sql
```

### 3. 查看生成的 SQL

```sql
-- drizzle/0004_agent_prompts.sql
CREATE TABLE IF NOT EXISTS "agent_prompts" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_name" text NOT NULL UNIQUE,
  "system_prompt" text NOT NULL,
  "user_prompt" text,
  "version" integer DEFAULT 1 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

### 4. 应用迁移

```bash
npm run db:migrate
```

输出：
```
🔄 开始数据库迁移...
📍 数据库: postgresql://xhs_admin:****@localhost:23010/xhs_generator
✅ 数据库迁移完成
```

### 5. 使用新表

```typescript
import { db } from '@/server/db';
import { agentPrompts } from '@/server/db/schema';

// 插入数据
await db.insert(agentPrompts).values({
  agentName: 'supervisor',
  systemPrompt: 'You are a supervisor agent...',
  version: 1,
});

// 查询数据
const prompts = await db.select().from(agentPrompts).where(eq(agentPrompts.isActive, true));
```

## 参考资料

- [Drizzle ORM 官方文档](https://orm.drizzle.team/)
- [Drizzle Kit 迁移指南](https://orm.drizzle.team/kit-docs/overview)
- [PostgreSQL 数据类型](https://www.postgresql.org/docs/current/datatype.html)
