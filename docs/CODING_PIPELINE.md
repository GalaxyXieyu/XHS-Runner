# XHS-Runner 开发流程 SOP

> 标准操作流程（Standard Operating Procedure），确保开发过程规范、可复用

## 目录

- [开发环境设置](#开发环境设置)
- [代码修改流程](#代码修改流程)
- [数据库 Schema 变更](#数据库-schema-变更)
- [Agent Prompt 修改](#agent-prompt-修改)
- [测试流程](#测试流程)
- [提交和部署](#提交和部署)
- [常见问题排查](#常见问题排查)

---

## 开发环境设置

### 首次启动

```bash
# 1. 安装依赖
npm install

# 2. 启动 Docker 服务
docker-compose up -d postgres

# 3. 同步数据库 Schema
npm run db:sync

# 4. 启动开发服务器
npm run dev
```

### 团队协作拉取代码后

```bash
# 1. 拉取最新代码
git pull

# 2. 安装新依赖（如果有）
npm install

# 3. 同步数据库 Schema（应用其他人的变更）
npm run db:sync

# 4. 重启应用
npm run dev
```

---

## 代码修改流程

### 1. 前端组件修改

```bash
# 修改文件
vim src/pages/index.tsx
# 或
vim src/components/YourComponent.tsx

# 保存后，Next.js 会自动热重载
# 在浏览器中验证修改
```

### 2. API 路由修改

```bash
# 修改 API 路由
vim src/pages/api/your-endpoint.ts

# 保存后，Next.js 会自动重载
# 使用 curl 或浏览器测试 API
curl http://localhost:3000/api/your-endpoint
```

### 3. 服务层修改

```bash
# 修改服务层代码
vim src/server/services/xhs/yourService.ts

# 重新编译服务层
npm run build:server

# 重启应用
# Ctrl+C 停止
npm run dev
```

---

## 数据库 Schema 变更

### 标准流程（推荐）

```bash
# 1. 修改 Schema 定义
vim src/server/db/schema.ts

# 2. 一键同步到数据库
npm run db:sync

# 3. 重启应用（重要！）
# Ctrl+C 停止当前应用
npm run dev
```

### 验证 Schema 变更

```bash
# 检查表是否创建成功
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "\dt"

# 查看表结构
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "\d your_table_name"

# 查看表数据
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "SELECT * FROM your_table_name LIMIT 5"
```

### 手动迁移（生产环境）

```bash
# 1. 生成迁移文件
npm run db:generate

# 2. 提交迁移文件
git add drizzle/
git commit -m "feat: add your_table_name table"

# 3. 在服务器上应用迁移
# 方式 A：使用同步脚本
npm run db:sync

# 方式 B：手动执行 SQL
docker-compose exec -T postgres psql -U xhs_admin -d xhs_generator < drizzle/0004_*.sql
```

---

## Agent Prompt 修改

### 标准流程

```bash
# 1. 修改 Prompt YAML 文件
vim prompts/supervisor.yaml
# 或其他 agent 的 prompt 文件

# 2. 同步到 Langfuse 和数据库
npx tsx scripts/sync-prompts-to-langfuse.ts

# 3. 验证同步结果
# 脚本会输出当前的 prompt 内容

# 4. 测试 Agent 行为
# 在应用中触发相应的 Agent 流程
```

### 快速调试（数据库直接修改）

```sql
-- 查看当前 prompt
SELECT agent_name, version, updated_at
FROM agent_prompts
WHERE agent_name = 'supervisor';

-- 修改 prompt（仅用于快速调试）
UPDATE agent_prompts
SET system_prompt = '新的 prompt 内容',
    version = version + 1,
    updated_at = NOW()
WHERE agent_name = 'supervisor';
```

**注意**：数据库直接修改仅用于快速调试，最终应该更新 YAML 文件并同步。

---

## 测试流程

### 手动测试

```bash
# 1. 启动开发服务器
npm run dev

# 2. 在浏览器中测试功能
# 打开 http://localhost:3000

# 3. 检查控制台日志
# 查看终端输出和浏览器控制台
```

### 烟雾测试（Smoke Test）

```bash
# 测试小红书登录和抓取
npm run smoke:xhs

# 测试主题抓取
npm run smoke:xhs-capture

# 通用烟雾测试
npm run test
```

### 数据库验证

```bash
# 验证数据是否正确写入
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "
SELECT COUNT(*) FROM topics WHERE created_at > NOW() - INTERVAL '1 hour';
"
```

---

## 提交和部署

### Git 提交规范

```bash
# 1. 查看修改
git status
git diff

# 2. 添加文件
git add src/server/db/schema.ts
git add drizzle/

# 3. 提交（使用票号前缀）
git commit -m "[XHS-999] Add image_download_queue table"

# 4. 推送
git push origin your-branch
```

### 提交消息格式

```
[XHS-###] <type>: <subject>

<body>

<footer>
```

**类型（type）**：
- `feat`: 新功能
- `fix`: 修复 bug
- `refactor`: 重构
- `docs`: 文档更新
- `chore`: 构建/工具变更
- `test`: 测试相关

**示例**：
```
[XHS-123] feat: add image download queue

- Add image_download_queue table
- Implement batch download service
- Add retry mechanism for failed downloads

Closes #123
```

### 部署流程

```bash
# 1. 构建应用
npm run build

# 2. 构建 Electron 包
npm run dist:mac  # macOS
npm run dist:win  # Windows

# 3. 在服务器上部署
# 拉取代码
git pull

# 安装依赖
npm install

# 同步数据库
npm run db:sync

# 重启应用
pm2 restart xhs-generator
```

---

## 常见问题排查

### 问题 1：表不存在错误

**现象**：
```
Error: relation "your_table_name" does not exist
```

**解决方案**：
```bash
# 1. 检查表是否真的存在
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "\dt your_table_name"

# 2. 如果不存在，运行同步
npm run db:sync

# 3. 重启应用（重要！）
# Ctrl+C 停止
npm run dev
```

### 问题 2：Docker 未运行

**现象**：
```
Error: connect ECONNREFUSED 127.0.0.1:23010
```

**解决方案**：
```bash
# 启动 Docker 服务
docker-compose up -d postgres

# 检查状态
docker-compose ps postgres

# 然后同步数据库
npm run db:sync
```

### 问题 3：迁移文件冲突

**现象**：
```
Error: migration file already exists
```

**解决方案**：
```bash
# 1. 删除冲突的迁移文件
rm drizzle/0004_*.sql

# 2. 重新生成
npm run db:generate

# 3. 应用迁移
npm run db:sync
```

### 问题 4：应用无法识别新表

**现象**：
- 表在数据库中存在
- 但应用报错"表不存在"

**原因**：
- 数据库连接在应用启动时建立
- Drizzle ORM 会缓存表结构信息

**解决方案**：
```bash
# 必须重启应用
# Ctrl+C 停止当前应用
npm run dev
```

### 问题 5：Prompt 修改未生效

**现象**：
- 修改了 YAML 文件
- 但 Agent 行为没有变化

**解决方案**：
```bash
# 1. 确认已同步到 Langfuse
npx tsx scripts/sync-prompts-to-langfuse.ts

# 2. 检查数据库中的 prompt
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "
SELECT agent_name, version, updated_at
FROM agent_prompts
WHERE agent_name = 'your_agent_name';
"

# 3. 清除缓存（如果有）
# 重启应用
npm run dev
```

---

## 快速命令参考

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build:server` | 编译服务层代码 |
| `npm run db:sync` | 同步数据库 Schema |
| `npm run db:generate` | 生成迁移文件 |
| `npm run db:push` | 直接推送 Schema（跳过迁移） |
| `npm run db:studio` | 打开数据库可视化工具 |
| `npm run smoke:xhs` | 运行小红书烟雾测试 |
| `docker-compose up -d postgres` | 启动 PostgreSQL |
| `docker-compose ps` | 查看容器状态 |

---

## 最佳实践

### 1. 修改 Schema 后立即同步

```bash
# 一条龙命令
npm run db:sync && npm run dev
```

### 2. 提交前检查

```bash
# 检查代码格式
git diff

# 检查是否有未提交的文件
git status

# 检查迁移文件是否生成
ls -la drizzle/
```

### 3. 团队协作

```bash
# 每天开始工作前
git pull
npm install
npm run db:sync
npm run dev

# 提交前
git status
git add .
git commit -m "[XHS-###] Your message"
git push
```

### 4. 数据库操作

- 优先使用 `npm run db:sync` 而不是手动执行 SQL
- 修改 Schema 后必须重启应用
- 生产环境使用迁移文件，不要使用 `db:push`

### 5. Prompt 管理

- 始终修改 YAML 文件，不要直接修改代码
- 修改后立即同步到 Langfuse
- 数据库直接修改仅用于快速调试

---

## 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目状态和功能清单
- [AGENTS.md](../AGENTS.md) - 仓库指南和架构说明

---

**最后更新**：2026-02-02
