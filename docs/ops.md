# Ops & Development

## 命令与验证清单

### 开发
- `npm run dev`
- `npm run dev:next`
- `npm run dev:electron`

### 构建
- `npm run build:server`
- `npm run build`

### Agent 流验证
- `npm run lint:supervisor-prompt`
- `npm run eval:agent-clarification`
- `npm run eval:clarification -- --baseUrl=http://localhost:3000`

### 发布
- `npm run pack`
- `npm run dist`
- `npm run dist:mac`
- `npm run dist:win`

### Prompt 同步
- `npx tsx scripts/sync-prompts-to-langfuse.ts`


## 开发流程 SOP

> 标准操作流程（Standard Operating Procedure），确保开发过程规范、可复用

### 目录

- [开发环境设置](#开发环境设置)
- [代码修改流程](#代码修改流程)
- [数据库 Schema 变更](#数据库-schema-变更)
- [Agent Prompt 修改](#agent-prompt-修改)
- [测试流程](#测试流程)
- [提交和部署](#提交和部署)
- [常见问题排查](#常见问题排查)

---

### 开发环境设置

#### 首次启动

```bash
## 1. 安装依赖
npm install

## 2. 启动 Docker 服务
docker-compose up -d postgres

## 3. 同步数据库 Schema
npm run db:sync

## 4. 启动开发服务器
npm run dev
```

#### 团队协作拉取代码后

```bash
## 1. 拉取最新代码
git pull

## 2. 安装新依赖（如果有）
npm install

## 3. 同步数据库 Schema（应用其他人的变更）
npm run db:sync

## 4. 重启应用
npm run dev
```

---

### 代码修改流程

#### 1. 前端组件修改

```bash
## 修改文件
vim src/pages/index.tsx
## 或
vim src/components/YourComponent.tsx

## 保存后，Next.js 会自动热重载
## 在浏览器中验证修改
```

#### 2. API 路由修改

```bash
## 修改 API 路由
vim src/pages/api/your-endpoint.ts

## 保存后，Next.js 会自动重载
## 使用 curl 或浏览器测试 API
curl http://localhost:3000/api/your-endpoint
```

#### 3. 服务层修改

```bash
## 修改服务层代码
vim src/server/services/xhs/yourService.ts

## 重新编译服务层
npm run build:server

## 重启应用
## Ctrl+C 停止
npm run dev
```

---

### 数据库 Schema 变更

#### 标准流程（推荐）

```bash
## 1. 修改 Schema 定义
vim src/server/db/schema.ts

## 2. 一键同步到数据库
npm run db:sync

## 3. 重启应用（重要！）
## Ctrl+C 停止当前应用
npm run dev
```

#### 验证 Schema 变更

```bash
## 检查表是否创建成功
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "\dt"

## 查看表结构
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "\d your_table_name"

## 查看表数据
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "SELECT * FROM your_table_name LIMIT 5"
```

#### 手动迁移（生产环境）

```bash
## 1. 生成迁移文件
npm run db:generate

## 2. 提交迁移文件
git add drizzle/
git commit -m "feat: add your_table_name table"

## 3. 在服务器上应用迁移
## 方式 A：使用同步脚本
npm run db:sync

## 方式 B：手动执行 SQL
docker-compose exec -T postgres psql -U xhs_admin -d xhs_generator < drizzle/0004_*.sql
```

---

### Agent Prompt 修改

#### 标准流程

```bash
## 1. 修改 Prompt YAML 文件
vim prompts/supervisor.yaml
## 或其他 agent 的 prompt 文件

## 2. 同步到 Langfuse 和数据库
npx tsx scripts/sync-prompts-to-langfuse.ts

## 3. 验证同步结果
## 脚本会输出当前的 prompt 内容

## 4. 测试 Agent 行为
## 在应用中触发相应的 Agent 流程
```

#### 快速调试（数据库直接修改）

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

### 测试流程

#### 手动测试

```bash
## 1. 启动开发服务器
npm run dev

## 2. 在浏览器中测试功能
## 打开 http://localhost:3000

## 3. 检查控制台日志
## 查看终端输出和浏览器控制台
```

#### 烟雾测试（Smoke Test）

```bash
## 测试小红书登录和抓取
npm run smoke:xhs

## 测试主题抓取
npm run smoke:xhs-capture

## 通用烟雾测试
npm run test
```

#### 数据库验证

```bash
## 验证数据是否正确写入
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "
SELECT COUNT(*) FROM topics WHERE created_at > NOW() - INTERVAL '1 hour';
"
```

---

### 提交和部署

#### Git 提交规范

```bash
## 1. 查看修改
git status
git diff

## 2. 添加文件
git add src/server/db/schema.ts
git add drizzle/

## 3. 提交（使用票号前缀）
git commit -m "[XHS-999] Add image_download_queue table"

## 4. 推送
git push origin your-branch
```

#### 提交消息格式

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

#### 部署流程

```bash
## 1. 构建应用
npm run build

## 2. 构建 Electron 包
npm run dist:mac  # macOS
npm run dist:win  # Windows

## 3. 在服务器上部署
## 拉取代码
git pull

## 安装依赖
npm install

## 同步数据库
npm run db:sync

## 重启应用
pm2 restart xhs-generator
```

---

### 常见问题排查

#### 问题 1：表不存在错误

**现象**：
```
Error: relation "your_table_name" does not exist
```

**解决方案**：
```bash
## 1. 检查表是否真的存在
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "\dt your_table_name"

## 2. 如果不存在，运行同步
npm run db:sync

## 3. 重启应用（重要！）
## Ctrl+C 停止
npm run dev
```

#### 问题 2：Docker 未运行

**现象**：
```
Error: connect ECONNREFUSED 127.0.0.1:23010
```

**解决方案**：
```bash
## 启动 Docker 服务
docker-compose up -d postgres

## 检查状态
docker-compose ps postgres

## 然后同步数据库
npm run db:sync
```

#### 问题 3：迁移文件冲突

**现象**：
```
Error: migration file already exists
```

**解决方案**：
```bash
## 1. 删除冲突的迁移文件
rm drizzle/0004_*.sql

## 2. 重新生成
npm run db:generate

## 3. 应用迁移
npm run db:sync
```

#### 问题 4：应用无法识别新表

**现象**：
- 表在数据库中存在
- 但应用报错"表不存在"

**原因**：
- 数据库连接在应用启动时建立
- Drizzle ORM 会缓存表结构信息

**解决方案**：
```bash
## 必须重启应用
## Ctrl+C 停止当前应用
npm run dev
```

#### 问题 5：Prompt 修改未生效

**现象**：
- 修改了 YAML 文件
- 但 Agent 行为没有变化

**解决方案**：
```bash
## 1. 确认已同步到 Langfuse
npx tsx scripts/sync-prompts-to-langfuse.ts

## 2. 检查数据库中的 prompt
docker-compose exec postgres psql -U xhs_admin -d xhs_generator -c "
SELECT agent_name, version, updated_at
FROM agent_prompts
WHERE agent_name = 'your_agent_name';
"

## 3. 清除缓存（如果有）
## 重启应用
npm run dev
```

---

### 快速命令参考

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

### 最佳实践

#### 1. 修改 Schema 后立即同步

```bash
## 一条龙命令
npm run db:sync && npm run dev
```

#### 2. 提交前检查

```bash
## 检查代码格式
git diff

## 检查是否有未提交的文件
git status

## 检查迁移文件是否生成
ls -la drizzle/
```

#### 3. 团队协作

```bash
## 每天开始工作前
git pull
npm install
npm run db:sync
npm run dev

## 提交前
git status
git add .
git commit -m "[XHS-###] Your message"
git push
```

#### 4. 数据库操作

- 优先使用 `npm run db:sync` 而不是手动执行 SQL
- 修改 Schema 后必须重启应用
- 生产环境使用迁移文件，不要使用 `db:push`

#### 5. Prompt 管理

- 始终修改 YAML 文件，不要直接修改代码
- 修改后立即同步到 Langfuse
- 数据库直接修改仅用于快速调试

---

### 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目状态和功能清单
- [AGENTS.md](../AGENTS.md) - 仓库指南和架构说明

---

**最后更新**：2026-02-02


## Smoke Testing

This project uses lightweight smoke tests as a fast regression gate.

### Goals

- Run quickly (seconds, not minutes)
- No network dependencies required
- Catch obvious breakages (API route handlers load, core workflow rules, scheduler cron parsing)

### Run

- `npm test`

It runs:
- `npm run build:server` (TypeScript compile for server-side code used by Electron)
- `node scripts/smoke/smokeTest.js`

### Design Rules

- Prefer **unit-like smoke tests** (directly execute handlers/modules) over spinning up Next.
- Keep tests deterministic; avoid time-sensitive assertions (other than "in the future").
- If an API route must be smoke-tested, keep its module format compatible with Node runtime used by tests.

### Module Format Note

The smoke runner is executed by Node using CommonJS `require()`.

- API route modules used by smoke tests should be loadable via `require()`.
- If a route is authored in a way that Node cannot load directly (e.g. ESM-only), either:
  - provide a small interop wrapper, or
  - move core logic into a shared server module that both Next API route and tests can import.

### Adding a New Smoke Test

1) Add a new `runTest('name', async () => { ... })` block in `scripts/smoke/smokeTest.js`.
2) Keep the assertion minimal: status code, shape, or a simple invariant.
3) Ensure it runs on CI/local without extra services.


## 生产环境部署

### 服务器信息

- **IP**: 38.76.195.125
- **用户**: root
- **端口**: 22
- **系统**: Ubuntu 24.04.1 x64

### 一、SSH 配置

#### 1.1 首次连接测试

```bash
## 从本地连接到服务器
ssh root@38.76.195.125
## 密码: ejebJLNC0398
```

#### 1.2 配置 SSH 密钥认证（推荐）

```bash
## 在本地生成 SSH 密钥（如果还没有）
ssh-keygen -t ed25519 -C "your_email@example.com"

## 复制公钥到服务器
ssh-copy-id root@38.76.195.125

## 测试密钥登录
ssh root@38.76.195.125
```

#### 1.3 SSH 安全加固

在服务器上执行：

```bash
## 备份原配置
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

## 编辑 SSH 配置
sudo nano /etc/ssh/sshd_config
```

推荐配置：
```
## 禁用密码登录（配置密钥后）
PasswordAuthentication no

## 禁用 root 密码登录
PermitRootLogin prohibit-password

## 只允许密钥认证
PubkeyAuthentication yes

## 禁用空密码
PermitEmptyPasswords no

## 设置登录超时
ClientAliveInterval 300
ClientAliveCountMax 2
```

重启 SSH 服务：
```bash
sudo systemctl restart sshd
```

### 二、服务器初始化

#### 2.1 更新系统

```bash
sudo apt update && sudo apt upgrade -y
```

#### 2.2 安装基础工具

```bash
sudo apt install -y curl wget git build-essential ufw
```

#### 2.3 配置防火墙

```bash
## 允许 SSH
sudo ufw allow 22/tcp

## 允许 HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

## 启用防火墙
sudo ufw --force enable

## 查看状态
sudo ufw status
```

### 三、安装运行环境

#### 3.1 安装 Node.js (v20 LTS)

```bash
## 使用 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

## 验证安装
node --version
npm --version
```

#### 3.2 安装 pnpm

```bash
npm install -g pnpm
pnpm --version
```

#### 3.3 安装 PM2（进程管理器）

```bash
npm install -g pm2

## 设置开机自启
pm2 startup systemd
## 按照输出的命令执行
```

#### 3.4 安装 Nginx

```bash
sudo apt install -y nginx

## 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

## 检查状态
sudo systemctl status nginx
```

### 四、部署项目

#### 4.1 创建项目目录

```bash
## 创建应用目录
sudo mkdir -p /var/www/xhs-generator
cd /var/www/xhs-generator
```

#### 4.2 配置环境变量

```bash
## 创建生产环境配置
nano .env.production
```

`.env.production` 内容：
```env
## 数据库配置
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator"

## LLM 配置（从数据库读取，这里是默认值）
LLM_BASE_URL="https://api.openai.com/v1"
LLM_API_KEY="your_api_key"
LLM_MODEL="gpt-4"

## Langfuse 配置
LANGFUSE_SECRET_KEY="your_secret_key"
LANGFUSE_PUBLIC_KEY="your_public_key"
LANGFUSE_HOST="https://cloud.langfuse.com"

## 生产环境配置
NODE_ENV=production
PORT=33001
```

#### 4.3 数据库初始化（首次）

**方式 A：本地执行迁移（推荐）**
```bash
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator" \
npx drizzle-kit migrate
```

**方式 B：导入 SQL 备份**
```bash
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator" \
npx tsx scripts/migrate-db/import-database.ts --file backups/supabase-export-xxx.sql
```

#### 4.4 本地打包并上传

```bash
## 本地打包（生成 dist/xhs-generator-standalone.tar.gz）
./scripts/package-standalone.sh

## 上传并解压
scp dist/xhs-generator-standalone.tar.gz root@38.76.195.125:/tmp/
ssh root@38.76.195.125 "mkdir -p /var/www/xhs-generator && tar -xzf /tmp/xhs-generator-standalone.tar.gz -C /var/www/xhs-generator"
```

#### 4.5 配置 PM2

创建/使用 PM2 配置文件（打包产物已自带，可按需调整）：

```bash
nano ecosystem.config.js
```

说明：打包产物中已包含 `ecosystem.config.js`，默认会优先使用 `.next/standalone/server.js`。

创建日志目录：
```bash
sudo mkdir -p /var/log/xhs-generator
sudo chown -R $USER:$USER /var/log/xhs-generator
```

启动应用：
```bash
pm2 start ecosystem.config.js
pm2 save
```

### 五、配置 Nginx 反向代理

#### 5.1 创建 Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/xhs-generator
```

内容：
```nginx
server {
    listen 80;
    server_name 38.76.195.125;  # 或你的域名

    # 日志
    access_log /var/log/nginx/xhs-generator-access.log;
    error_log /var/log/nginx/xhs-generator-error.log;

    # 反向代理到 Next.js
    location / {
        proxy_pass http://localhost:33001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存
    location /_next/static {
        proxy_pass http://localhost:33001;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/xhs-generator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 5.2 配置 HTTPS（可选，需要域名）

```bash
## 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

## 获取证书（替换为你的域名）
sudo certbot --nginx -d your-domain.com

## 自动续期
sudo certbot renew --dry-run
```

### 六、监控和维护

#### 6.1 PM2 常用命令

```bash
## 查看应用状态
pm2 status

## 查看日志
pm2 logs xhs-generator

## 重启应用
pm2 restart xhs-generator

## 停止应用
pm2 stop xhs-generator

## 查看监控面板
pm2 monit
```

#### 6.2 日志管理

```bash
## 查看 Nginx 日志
sudo tail -f /var/log/nginx/xhs-generator-access.log
sudo tail -f /var/log/nginx/xhs-generator-error.log

## 查看应用日志
tail -f /var/log/xhs-generator/out.log
tail -f /var/log/xhs-generator/error.log
```

#### 6.3 更新部署

```bash
## 本地重新打包
./scripts/package-standalone.sh

## 上传并解压
scp dist/xhs-generator-standalone.tar.gz root@38.76.195.125:/tmp/
ssh root@38.76.195.125 "tar -xzf /tmp/xhs-generator-standalone.tar.gz -C /var/www/xhs-generator"

## 重启应用
ssh root@38.76.195.125 "pm2 restart xhs-generator && pm2 save"
```

### 七、安全建议

1. **定期更新系统**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **配置 fail2ban 防止暴力破解**
   ```bash
   sudo apt install -y fail2ban
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

3. **定期备份数据库**
   - 配置定时任务备份或使用托管商备份

4. **监控服务器资源**
   ```bash
   # 安装 htop
   sudo apt install -y htop

   # 查看资源使用
   htop
   ```

5. **设置告警通知**
   - 配置 PM2 Plus 或其他监控服务
   - 设置磁盘空间、内存、CPU 告警

### 八、故障排查

#### 应用无法启动
```bash
## 检查端口占用
sudo lsof -i :3000

## 检查 PM2 日志
pm2 logs xhs-generator --lines 100

## 检查环境变量
pm2 env 0
```

#### Nginx 502 错误
```bash
## 检查 Next.js 是否运行
pm2 status

## 检查 Nginx 配置
sudo nginx -t

## 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log
```

#### 数据库连接失败
```bash
## 测试数据库连接
psql "postgresql://postgres:password@your-db-host:5432/xhs_generator"

## 检查防火墙规则
sudo ufw status
```

### 九、性能优化

1. **启用 Gzip 压缩**（Nginx 配置）
2. **配置 CDN**（如果有静态资源）
3. **数据库连接池优化**
4. **启用 Next.js 缓存**
5. **配置 Redis 缓存**（可选）

### 十、快速部署脚本

参考 `scripts/package-standalone.sh` 与 GitHub Actions 自动化部署流程。


## CI/CD 部署

### 概述

本项目使用 GitHub Actions 实现自动化部署，每次推送到 `main` 分支时自动部署到生产服务器。

### 部署架构

```
GitHub Push → GitHub Actions 构建打包 → SCP 上传 → 服务器解压 → PM2 重启 → 健康检查
```

### 一、服务器初始化（首次部署）

#### 1.1 上传并运行初始化脚本

```bash
## 从本地上传脚本到服务器
scp scripts/init-server.sh root@38.76.197.25:/root/

## SSH 连接到服务器
ssh root@38.76.197.25

## 运行初始化脚本
chmod +x /root/init-server.sh
/root/init-server.sh
```

初始化脚本会自动完成：
- ✅ 系统更新
- ✅ 安装 Node.js 20 + pnpm + PM2
- ✅ 安装 Nginx 并配置反向代理
- ✅ 配置防火墙（UFW）
- ✅ 配置 SSH 安全加固
- ✅ 安装 fail2ban 防暴力破解

#### 1.2 初始化数据库服务（可选）

如果生产服务器未安装 Postgres，可运行：
```bash
ssh root@38.76.197.25 "bash -s" < scripts/migrate-db/setup-postgres.sh
```

#### 1.3 配置 SSH 密钥认证

```bash
## 在本地生成 SSH 密钥（如果还没有）
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/xhs_deploy

## 上传公钥到服务器
ssh-copy-id -i ~/.ssh/xhs_deploy.pub root@38.76.197.25

## 测试密钥登录
ssh -i ~/.ssh/xhs_deploy root@38.76.197.25
```

#### 1.4 创建部署目录

```bash
## SSH 连接到服务器
ssh root@38.76.197.25

## 创建目录（用于解压构建产物）
mkdir -p /var/www/xhs-generator
```

#### 1.5 配置环境变量

```bash
## 在服务器上创建环境变量文件
nano /var/www/xhs-generator/.env.production
```

内容：
```env
## 数据库配置
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator"

## LLM 配置
LLM_BASE_URL="https://api.openai.com/v1"
LLM_API_KEY="your_api_key"
LLM_MODEL="gpt-4"

## Langfuse 配置
LANGFUSE_SECRET_KEY="your_secret_key"
LANGFUSE_PUBLIC_KEY="your_public_key"
LANGFUSE_HOST="https://cloud.langfuse.com"

## 生产环境配置
NODE_ENV=production
PORT=33001
```

#### 1.6 数据库初始化（首次）

如果生产库是新建的，先做一次初始化：

**方式 A：本地执行迁移（推荐）**
```bash
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator" \
npx drizzle-kit migrate
```

**方式 B：导入 SQL 备份**
```bash
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator" \
npx tsx scripts/migrate-db/import-database.ts --file backups/supabase-export-xxx.sql
```

> 说明：如数据库已在 lagp-pg 或其他托管实例中初始化，可跳过此步骤。

#### 1.7 首次部署

```bash
## 本地打包
./scripts/package-standalone.sh

## 上传并解压
scp dist/xhs-generator-standalone.tar.gz root@38.76.197.25:/tmp/
ssh root@38.76.197.25 "mkdir -p /var/www/xhs-generator && tar -xzf /tmp/xhs-generator-standalone.tar.gz -C /var/www/xhs-generator"

## 启动应用
ssh root@38.76.197.25 "pm2 restart xhs-generator || pm2 start /var/www/xhs-generator/ecosystem.config.js && pm2 save"
```

### 二、配置 GitHub Actions

#### 2.1 添加 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

1. 进入仓库 → Settings → Secrets and variables → Actions
2. 点击 "New repository secret" 添加以下密钥：

| Secret Name | Value | 说明 |
|-------------|-------|------|
| `SERVER_HOST` | `38.76.197.25` | 服务器 IP |
| `SERVER_USER` | `root` | SSH 用户名 |
| `SSH_PRIVATE_KEY` | `私钥内容` | SSH 私钥（~/.ssh/xhs_deploy） |
| `DATABASE_URL` | `postgresql://...` | 数据库连接字符串 |

**获取 SSH 私钥内容**：
```bash
cat ~/.ssh/xhs_deploy
```

复制完整内容（包括 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----`）

#### 2.2 测试 GitHub Actions

```bash
## 提交代码触发部署
git add .
git commit -m "feat: setup CI/CD"
git push origin main
```

查看部署状态：
- 进入 GitHub 仓库 → Actions 标签
- 查看最新的 workflow 运行状态

### 三、日常使用

#### 3.1 自动部署

每次推送到 `main` 分支时自动触发部署（GitHub Actions 会完成构建打包并上传）：

```bash
git add .
git commit -m "feat: your changes"
git push origin main
```

#### 3.2 手动部署

在 GitHub Actions 页面手动触发：
1. 进入 Actions 标签
2. 选择 "Deploy to Production" workflow
3. 点击 "Run workflow"

#### 3.3 服务器管理

```bash
## SSH 连接到服务器
ssh root@38.76.197.25

## 查看应用状态
pm2 status

## 查看日志
pm2 logs xhs-generator

## 重启应用
pm2 restart xhs-generator

## 查看 Nginx 日志
sudo tail -f /var/log/nginx/xhs-generator-access.log
```

### 四、监控和维护

#### 4.1 健康检查

GitHub Actions 会在部署后自动进行健康检查：
```bash
curl -f http://38.76.197.25
```

#### 4.2 日志查看

```bash
## 应用日志
tail -f /var/log/xhs-generator/out.log
tail -f /var/log/xhs-generator/error.log

## Nginx 日志
sudo tail -f /var/log/nginx/xhs-generator-access.log
sudo tail -f /var/log/nginx/xhs-generator-error.log

## PM2 日志
pm2 logs xhs-generator --lines 100
```

#### 4.3 性能监控

```bash
## 查看资源使用
htop

## 查看 PM2 监控面板
pm2 monit

## 查看磁盘使用
df -h

## 查看内存使用
free -h
```

### 五、故障排查

#### 5.1 部署失败

**检查 GitHub Actions 日志**：
- 进入 Actions 标签查看详细错误信息

**常见问题**：
1. SSH 连接失败 → 检查 SSH_PRIVATE_KEY 是否正确
2. 构建失败 → 检查环境变量是否配置
3. 健康检查失败 → 检查应用是否正常启动

#### 5.2 应用无法访问

```bash
## 检查应用是否运行
pm2 status

## 检查端口占用
sudo lsof -i :3000

## 检查 Nginx 状态
sudo systemctl status nginx

## 测试 Nginx 配置
sudo nginx -t
```

#### 5.3 数据库连接失败

```bash
## 测试数据库连接
psql "postgresql://postgres:password@your-db-host:5432/xhs_generator"

## 检查环境变量
cat /var/www/xhs-generator/.env.production
```

### 六、回滚部署

如果新版本有问题，可以快速回滚：

```bash
## SSH 连接到服务器
ssh root@38.76.197.25

cd /var/www/xhs-generator

## 回滚到上一个版本
git log --oneline -5  # 查看最近的提交
git reset --hard <commit-hash>

## 重新部署
./scripts/deploy.sh
```

### 七、安全建议

1. **定期更新系统**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **监控 fail2ban 日志**
   ```bash
   sudo fail2ban-client status sshd
   ```

3. **定期备份数据库**
   - 配置定时任务备份（pg_dump 或托管商自带备份）

4. **配置 HTTPS**（如果有域名）
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

5. **限制 SSH 访问**
   - 只允许特定 IP 访问（可选）
   ```bash
   sudo ufw allow from YOUR_IP to any port 22
   ```

### 八、性能优化

1. **启用 Gzip 压缩**（已在 Nginx 配置中）
2. **配置 CDN**（如果需要）
3. **启用 Next.js 缓存**
4. **配置 Redis 缓存**（可选）
5. **数据库连接池优化**

### 九、快速命令参考

```bash
## 服务器初始化
scp scripts/init-server.sh root@38.76.197.25:/root/
ssh root@38.76.197.25 "chmod +x /root/init-server.sh && /root/init-server.sh"

## 手动部署
ssh root@38.76.197.25 "cd /var/www/xhs-generator && ./scripts/deploy.sh"

## 查看日志
ssh root@38.76.197.25 "pm2 logs xhs-generator --lines 50"

## 重启应用
ssh root@38.76.197.25 "pm2 restart xhs-generator"

## 查看状态
ssh root@38.76.197.25 "pm2 status && systemctl status nginx"
```

### 十、下一步优化

- [ ] 配置域名和 HTTPS
- [ ] 设置监控告警（PM2 Plus / Sentry）
- [ ] 配置自动备份
- [ ] 添加蓝绿部署
- [ ] 配置 CDN 加速
- [ ] 添加性能监控（New Relic / DataDog）
