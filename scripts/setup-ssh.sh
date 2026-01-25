#!/bin/bash

# SSH 自动化配置脚本
# 用途：配置本地 SSH 密钥和服务器连接

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 服务器配置
SERVER_HOST="38.76.195.125"
SERVER_USER="root"
SSH_KEY_PATH="$HOME/.ssh/xhs_deploy"
SSH_CONFIG_PATH="$HOME/.ssh/config"

log_info "开始配置 SSH 自动化连接..."

# 1. 检查 SSH 密钥是否存在
if [ -f "$SSH_KEY_PATH" ]; then
    log_warn "SSH 密钥已存在: $SSH_KEY_PATH"
    read -p "是否重新生成？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f "$SSH_KEY_PATH" "$SSH_KEY_PATH.pub"
    else
        log_info "使用现有密钥"
    fi
fi

# 2. 生成 SSH 密钥
if [ ! -f "$SSH_KEY_PATH" ]; then
    log_info "生成 SSH 密钥..."
    ssh-keygen -t ed25519 -C "xhs-generator-deploy" -f "$SSH_KEY_PATH" -N ""
    log_info "✅ SSH 密钥已生成: $SSH_KEY_PATH"
fi

# 3. 上传公钥到服务器
log_info "上传公钥到服务器..."
log_warn "请输入服务器密码: ejebJLNC0398"
ssh-copy-id -i "$SSH_KEY_PATH.pub" "$SERVER_USER@$SERVER_HOST"

# 4. 测试密钥登录
log_info "测试密钥登录..."
if ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o ConnectTimeout=5 "$SERVER_USER@$SERVER_HOST" "echo '连接成功'" > /dev/null 2>&1; then
    log_info "✅ 密钥登录测试成功"
else
    log_error "❌ 密钥登录测试失败"
    exit 1
fi

# 5. 配置 SSH config
log_info "配置 SSH config..."

# 备份现有配置
if [ -f "$SSH_CONFIG_PATH" ]; then
    cp "$SSH_CONFIG_PATH" "$SSH_CONFIG_PATH.bak"
    log_info "已备份现有配置: $SSH_CONFIG_PATH.bak"
fi

# 检查是否已存在配置
if grep -q "Host xhs-prod" "$SSH_CONFIG_PATH" 2>/dev/null; then
    log_warn "SSH config 中已存在 xhs-prod 配置，跳过"
else
    # 添加配置
    cat >> "$SSH_CONFIG_PATH" << EOF

# XHS-Generator 生产服务器
Host xhs-prod
    HostName $SERVER_HOST
    User $SERVER_USER
    Port 22
    IdentityFile $SSH_KEY_PATH
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking accept-new
EOF
    log_info "✅ SSH config 已配置"
fi

# 6. 设置权限
chmod 600 "$SSH_KEY_PATH"
chmod 644 "$SSH_KEY_PATH.pub"
chmod 600 "$SSH_CONFIG_PATH"

log_info ""
log_info "✅ SSH 自动化配置完成！"
log_info ""
log_info "现在你可以使用以下方式连接服务器："
log_info "  方式 1: ssh xhs-prod"
log_info "  方式 2: ssh -i $SSH_KEY_PATH $SERVER_USER@$SERVER_HOST"
log_info ""
log_info "测试连接："
log_info "  ssh xhs-prod 'hostname && uptime'"
log_info ""
log_info "GitHub Actions 配置："
log_info "  1. 复制私钥内容:"
log_info "     cat $SSH_KEY_PATH | pbcopy"
log_info "  2. 在 GitHub 仓库添加 Secret: SSH_PRIVATE_KEY"
log_info "  3. 粘贴私钥内容"
