# Scripts 目录说明

本目录包含项目的各类脚本工具。

## 数据库管理

### `migrate-db.ts`
执行 Drizzle 数据库迁移。

```bash
npm run db:migrate
```

### `migrate-db/init-db.sh`
Docker PostgreSQL 容器首次启动时自动执行，初始化主应用数据库。

### `migrate-db/init-langfuse-db.sh`
Docker PostgreSQL 容器首次启动时自动执行，初始化 Langfuse 数据库。

### `migrate-db/setup-postgres.sh`
生产环境 PostgreSQL 安装和配置脚本。支持 Ubuntu/Debian 和 CentOS/RHEL。

```bash
sudo bash scripts/migrate-db/setup-postgres.sh
```

## Prompt 管理

### `sync-prompts-to-langfuse.ts`
将 `prompts/*.yaml` 文件同步到 Langfuse 和本地数据库。

```bash
npx tsx scripts/sync-prompts-to-langfuse.ts
```

详见：[CLAUDE.md - Multi-Agent Prompt 管理](../CLAUDE.md#multi-agent-prompt-管理)

## 存储管理

### `init-minio-storage.ts`
初始化 MinIO 存储桶和配置。

```bash
npx tsx scripts/init-minio-storage.ts
```

## 开发工具

### `check-latest-creative.ts`
检查最新生成的创意内容。

```bash
npx tsx scripts/check-latest-creative.ts
```

### `reset-capture-data.ts`
重置抓取的数据（开发环境使用）。

```bash
npx tsx scripts/reset-capture-data.ts
```

### `smoke/smokeTest.js`
冒烟测试脚本，验证核心功能。

```bash
npm test
```

## 部署脚本

### `deploy.sh`
应用部署脚本。

### `init-server.sh`
服务器初始化脚本。

### `setup-ssh.sh`
SSH 配置脚本。

### `package-standalone.sh`
打包独立应用。

### `monitor-performance.sh`
性能监控脚本。

## 脚本开发规范

1. **命名规范**：使用 kebab-case，如 `sync-prompts-to-langfuse.ts`
2. **文件类型**：
   - `.ts` - TypeScript 脚本（使用 `tsx` 运行）
   - `.sh` - Shell 脚本（需要 `chmod +x`）
   - `.js` - JavaScript 脚本（使用 `node` 运行）
3. **文档要求**：每个脚本顶部应包含用途说明和使用示例
4. **错误处理**：脚本应包含适当的错误处理和日志输出

## 清理历史

- 2026-02-02: 删除 Supabase 迁移脚本（已迁移到本地 PostgreSQL）
- 2026-02-02: 删除一次性测试脚本
- 2026-02-02: 删除已执行的一次性迁移脚本
