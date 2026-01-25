# XHS-Generator 生产环境部署指南

## 服务器信息

- **IP**: 38.76.195.125
- **用户**: root
- **端口**: 22
- **系统**: Ubuntu 24.04.1 x64

## 一、SSH 配置

### 1.1 首次连接测试

```bash
# 从本地连接到服务器
ssh root@38.76.195.125
# 密码: ejebJLNC0398
```

### 1.2 配置 SSH 密钥认证（推荐）

```bash
# 在本地生成 SSH 密钥（如果还没有）
ssh-keygen -t ed25519 -C "your_email@example.com"

# 复制公钥到服务器
ssh-copy-id root@38.76.195.125

# 测试密钥登录
ssh root@38.76.195.125
```

### 1.3 SSH 安全加固

在服务器上执行：

```bash
# 备份原配置
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# 编辑 SSH 配置
sudo nano /etc/ssh/sshd_config
```

推荐配置：
```
# 禁用密码登录（配置密钥后）
PasswordAuthentication no

# 禁用 root 密码登录
PermitRootLogin prohibit-password

# 只允许密钥认证
PubkeyAuthentication yes

# 禁用空密码
PermitEmptyPasswords no

# 设置登录超时
ClientAliveInterval 300
ClientAliveCountMax 2
```

重启 SSH 服务：
```bash
sudo systemctl restart sshd
```

## 二、服务器初始化

### 2.1 更新系统

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 安装基础工具

```bash
sudo apt install -y curl wget git build-essential ufw
```

### 2.3 配置防火墙

```bash
# 允许 SSH
sudo ufw allow 22/tcp

# 允许 HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw --force enable

# 查看状态
sudo ufw status
```

## 三、安装运行环境

### 3.1 安装 Node.js (v20 LTS)

```bash
# 使用 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version
npm --version
```

### 3.2 安装 pnpm

```bash
npm install -g pnpm
pnpm --version
```

### 3.3 安装 PM2（进程管理器）

```bash
npm install -g pm2

# 设置开机自启
pm2 startup systemd
# 按照输出的命令执行
```

### 3.4 安装 Nginx

```bash
sudo apt install -y nginx

# 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 检查状态
sudo systemctl status nginx
```

## 四、部署项目

### 4.1 创建项目目录

```bash
# 创建应用目录
sudo mkdir -p /var/www/xhs-generator
cd /var/www/xhs-generator
```

### 4.2 配置环境变量

```bash
# 创建生产环境配置
nano .env.production
```

`.env.production` 内容：
```env
# 数据库配置
DATABASE_URL="postgresql://postgres:your_password@your-db-host:5432/xhs_generator"

# LLM 配置（从数据库读取，这里是默认值）
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

### 4.3 数据库初始化（首次）

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

### 4.4 本地打包并上传

```bash
# 本地打包（生成 dist/xhs-generator-standalone.tar.gz）
./scripts/package-standalone.sh

# 上传并解压
scp dist/xhs-generator-standalone.tar.gz root@38.76.195.125:/tmp/
ssh root@38.76.195.125 "mkdir -p /var/www/xhs-generator && tar -xzf /tmp/xhs-generator-standalone.tar.gz -C /var/www/xhs-generator"
```

### 4.5 配置 PM2

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

## 五、配置 Nginx 反向代理

### 5.1 创建 Nginx 配置

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

### 5.2 配置 HTTPS（可选，需要域名）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书（替换为你的域名）
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 六、监控和维护

### 6.1 PM2 常用命令

```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs xhs-generator

# 重启应用
pm2 restart xhs-generator

# 停止应用
pm2 stop xhs-generator

# 查看监控面板
pm2 monit
```

### 6.2 日志管理

```bash
# 查看 Nginx 日志
sudo tail -f /var/log/nginx/xhs-generator-access.log
sudo tail -f /var/log/nginx/xhs-generator-error.log

# 查看应用日志
tail -f /var/log/xhs-generator/out.log
tail -f /var/log/xhs-generator/error.log
```

### 6.3 更新部署

```bash
# 本地重新打包
./scripts/package-standalone.sh

# 上传并解压
scp dist/xhs-generator-standalone.tar.gz root@38.76.195.125:/tmp/
ssh root@38.76.195.125 "tar -xzf /tmp/xhs-generator-standalone.tar.gz -C /var/www/xhs-generator"

# 重启应用
ssh root@38.76.195.125 "pm2 restart xhs-generator && pm2 save"
```

## 七、安全建议

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

## 八、故障排查

### 应用无法启动
```bash
# 检查端口占用
sudo lsof -i :3000

# 检查 PM2 日志
pm2 logs xhs-generator --lines 100

# 检查环境变量
pm2 env 0
```

### Nginx 502 错误
```bash
# 检查 Next.js 是否运行
pm2 status

# 检查 Nginx 配置
sudo nginx -t

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log
```

### 数据库连接失败
```bash
# 测试数据库连接
psql "postgresql://postgres:password@your-db-host:5432/xhs_generator"

# 检查防火墙规则
sudo ufw status
```

## 九、性能优化

1. **启用 Gzip 压缩**（Nginx 配置）
2. **配置 CDN**（如果有静态资源）
3. **数据库连接池优化**
4. **启用 Next.js 缓存**
5. **配置 Redis 缓存**（可选）

## 十、快速部署脚本

参考 `scripts/package-standalone.sh` 与 GitHub Actions 自动化部署流程。
