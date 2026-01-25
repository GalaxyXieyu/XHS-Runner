#!/bin/bash

# XHS-Generator 服务器初始化脚本
# 用途：在全新的 Ubuntu 24.04 服务器上自动配置生产环境

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    log_error "请使用 root 用户运行此脚本"
    exit 1
fi

log_info "开始初始化服务器..."

# 1. 更新系统
log_info "更新系统包..."
apt update && apt upgrade -y

# 2. 安装基础工具
log_info "安装基础工具..."
apt install -y curl wget git build-essential ufw fail2ban

# 3. 配置防火墙
log_info "配置防火墙..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 4. 安装 Node.js 20
log_info "安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 5. 安装 pnpm
log_info "安装 pnpm..."
npm install -g pnpm

# 6. 安装 PM2
log_info "安装 PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root

# 7. 安装 Nginx
log_info "安装 Nginx..."
apt install -y nginx
systemctl start nginx
systemctl enable nginx

# 8. 创建项目目录
log_info "创建项目目录..."
mkdir -p /var/www/xhs-generator
mkdir -p /var/log/xhs-generator

# 9. 配置 Nginx
log_info "配置 Nginx..."
cat > /etc/nginx/sites-available/xhs-generator << 'EOF'
server {
    listen 80;
    server_name _;

    access_log /var/log/nginx/xhs-generator-access.log;
    error_log /var/log/nginx/xhs-generator-error.log;

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

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /_next/static {
        proxy_pass http://localhost:33001;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/xhs-generator /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 10. 配置 SSH 安全
log_info "配置 SSH 安全..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# 11. 配置 fail2ban
log_info "配置 fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

log_info "✅ 服务器初始化完成！"
log_info ""
log_info "下一步操作："
log_info "1. 上传 SSH 公钥到服务器"
log_info "2. 创建部署目录 /var/www/xhs-generator（用于解压构建产物）"
log_info "3. 配置环境变量 .env.production"
log_info "4. 初始化数据库（drizzle migrate 或导入 SQL）"
log_info "5. 上传打包产物并启动 PM2"
log_info ""
log_info "服务器信息："
log_info "- Node.js: $(node --version)"
log_info "- pnpm: $(pnpm --version)"
log_info "- PM2: $(pm2 --version)"
log_info "- Nginx: $(nginx -v 2>&1)"
