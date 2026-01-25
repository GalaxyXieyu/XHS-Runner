# XHS-Generator CI/CD 快速部署指南

## 概述

本项目使用 GitHub Actions 实现自动化部署，每次推送到 `main` 分支时自动部署到生产服务器。

## 部署架构

```
GitHub Push → GitHub Actions 构建打包 → SCP 上传 → 服务器解压 → PM2 重启 → 健康检查
```

## 一、服务器初始化（首次部署）

### 1.1 上传并运行初始化脚本

```bash
# 从本地上传脚本到服务器
scp scripts/init-server.sh root@38.76.195.125:/root/

# SSH 连接到服务器
ssh root@38.76.195.125

# 运行初始化脚本
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

### 1.2 初始化数据库服务（可选）

如果生产服务器未安装 Postgres，可运行：
```bash
ssh root@38.76.195.125 "bash -s" < scripts/migrate-db/setup-postgres.sh
```

### 1.3 配置 SSH 密钥认证

```bash
# 在本地生成 SSH 密钥（如果还没有）
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/xhs_deploy

# 上传公钥到服务器
ssh-copy-id -i ~/.ssh/xhs_deploy.pub root@38.76.195.125

# 测试密钥登录
ssh -i ~/.ssh/xhs_deploy root@38.76.195.125
```

### 1.4 创建部署目录

```bash
# SSH 连接到服务器
ssh root@38.76.195.125

# 创建目录（用于解压构建产物）
mkdir -p /var/www/xhs-generator
```

### 1.5 配置环境变量

```bash
# 在服务器上创建环境变量文件
nano /var/www/xhs-generator/.env.production
```

内容：
```env
# 数据库配置
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator"

# LLM 配置
LLM_BASE_URL="https://api.openai.com/v1"
LLM_API_KEY="your_api_key"
LLM_MODEL="gpt-4"

# Langfuse 配置
LANGFUSE_SECRET_KEY="your_secret_key"
LANGFUSE_PUBLIC_KEY="your_public_key"
LANGFUSE_HOST="https://cloud.langfuse.com"

# 生产环境配置
NODE_ENV=production
PORT=33001
```

### 1.6 数据库初始化（首次）

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

### 1.7 首次部署

```bash
# 本地打包
./scripts/package-standalone.sh

# 上传并解压
scp dist/xhs-generator-standalone.tar.gz root@38.76.195.125:/tmp/
ssh root@38.76.195.125 "mkdir -p /var/www/xhs-generator && tar -xzf /tmp/xhs-generator-standalone.tar.gz -C /var/www/xhs-generator"

# 启动应用
ssh root@38.76.195.125 "pm2 restart xhs-generator || pm2 start /var/www/xhs-generator/ecosystem.config.js && pm2 save"
```

## 二、配置 GitHub Actions

### 2.1 添加 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

1. 进入仓库 → Settings → Secrets and variables → Actions
2. 点击 "New repository secret" 添加以下密钥：

| Secret Name | Value | 说明 |
|-------------|-------|------|
| `SERVER_HOST` | `38.76.195.125` | 服务器 IP |
| `SERVER_USER` | `root` | SSH 用户名 |
| `SSH_PRIVATE_KEY` | `私钥内容` | SSH 私钥（~/.ssh/xhs_deploy） |
| `DATABASE_URL` | `postgresql://...` | 数据库连接字符串 |

**获取 SSH 私钥内容**：
```bash
cat ~/.ssh/xhs_deploy
```

复制完整内容（包括 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----`）

### 2.2 测试 GitHub Actions

```bash
# 提交代码触发部署
git add .
git commit -m "feat: setup CI/CD"
git push origin main
```

查看部署状态：
- 进入 GitHub 仓库 → Actions 标签
- 查看最新的 workflow 运行状态

## 三、日常使用

### 3.1 自动部署

每次推送到 `main` 分支时自动触发部署（GitHub Actions 会完成构建打包并上传）：

```bash
git add .
git commit -m "feat: your changes"
git push origin main
```

### 3.2 手动部署

在 GitHub Actions 页面手动触发：
1. 进入 Actions 标签
2. 选择 "Deploy to Production" workflow
3. 点击 "Run workflow"

### 3.3 服务器管理

```bash
# SSH 连接到服务器
ssh root@38.76.195.125

# 查看应用状态
pm2 status

# 查看日志
pm2 logs xhs-generator

# 重启应用
pm2 restart xhs-generator

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/xhs-generator-access.log
```

## 四、监控和维护

### 4.1 健康检查

GitHub Actions 会在部署后自动进行健康检查：
```bash
curl -f http://38.76.195.125
```

### 4.2 日志查看

```bash
# 应用日志
tail -f /var/log/xhs-generator/out.log
tail -f /var/log/xhs-generator/error.log

# Nginx 日志
sudo tail -f /var/log/nginx/xhs-generator-access.log
sudo tail -f /var/log/nginx/xhs-generator-error.log

# PM2 日志
pm2 logs xhs-generator --lines 100
```

### 4.3 性能监控

```bash
# 查看资源使用
htop

# 查看 PM2 监控面板
pm2 monit

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

## 五、故障排查

### 5.1 部署失败

**检查 GitHub Actions 日志**：
- 进入 Actions 标签查看详细错误信息

**常见问题**：
1. SSH 连接失败 → 检查 SSH_PRIVATE_KEY 是否正确
2. 构建失败 → 检查环境变量是否配置
3. 健康检查失败 → 检查应用是否正常启动

### 5.2 应用无法访问

```bash
# 检查应用是否运行
pm2 status

# 检查端口占用
sudo lsof -i :3000

# 检查 Nginx 状态
sudo systemctl status nginx

# 测试 Nginx 配置
sudo nginx -t
```

### 5.3 数据库连接失败

```bash
# 测试数据库连接
psql "postgresql://postgres:password@your-db-host:5432/xhs_generator"

# 检查环境变量
cat /var/www/xhs-generator/.env.production
```

## 六、回滚部署

如果新版本有问题，可以快速回滚：

```bash
# SSH 连接到服务器
ssh root@38.76.195.125

cd /var/www/xhs-generator

# 回滚到上一个版本
git log --oneline -5  # 查看最近的提交
git reset --hard <commit-hash>

# 重新部署
./scripts/deploy.sh
```

## 七、安全建议

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

## 八、性能优化

1. **启用 Gzip 压缩**（已在 Nginx 配置中）
2. **配置 CDN**（如果需要）
3. **启用 Next.js 缓存**
4. **配置 Redis 缓存**（可选）
5. **数据库连接池优化**

## 九、快速命令参考

```bash
# 服务器初始化
scp scripts/init-server.sh root@38.76.195.125:/root/
ssh root@38.76.195.125 "chmod +x /root/init-server.sh && /root/init-server.sh"

# 手动部署
ssh root@38.76.195.125 "cd /var/www/xhs-generator && ./scripts/deploy.sh"

# 查看日志
ssh root@38.76.195.125 "pm2 logs xhs-generator --lines 50"

# 重启应用
ssh root@38.76.195.125 "pm2 restart xhs-generator"

# 查看状态
ssh root@38.76.195.125 "pm2 status && systemctl status nginx"
```

## 十、下一步优化

- [ ] 配置域名和 HTTPS
- [ ] 设置监控告警（PM2 Plus / Sentry）
- [ ] 配置自动备份
- [ ] 添加蓝绿部署
- [ ] 配置 CDN 加速
- [ ] 添加性能监控（New Relic / DataDog）
