#!/bin/bash

# XHS-Generator 快速部署脚本
# 用途：在已初始化的服务器上部署/更新应用

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

# 配置
PROJECT_DIR="/var/www/xhs-generator"
APP_NAME="xhs-generator"

log_info "开始部署 XHS-Generator..."

# 支持通过打包产物部署
ARTIFACT=""
for arg in "$@"; do
  case $arg in
    --artifact=*)
      ARTIFACT="${arg#*=}"
      shift
      ;;
  esac
done

# 1. 进入项目目录
cd $PROJECT_DIR || {
    log_error "项目目录不存在: $PROJECT_DIR"
    exit 1
}

if [ -n "$ARTIFACT" ]; then
    log_info "使用打包产物部署: $ARTIFACT"
    if [ ! -f "$ARTIFACT" ]; then
        log_error "产物不存在: $ARTIFACT"
        exit 1
    fi

    tar -xzf "$ARTIFACT" -C "$PROJECT_DIR"
else
    # 2. 拉取最新代码
    log_info "拉取最新代码..."
    git pull origin main

    # 3. 安装依赖
    log_info "安装依赖..."
    pnpm install --frozen-lockfile

    # 4. 构建项目
    log_info "构建项目..."
    pnpm build
fi

# 5. 重启应用
log_info "重启应用..."
if pm2 list | grep -q $APP_NAME; then
    pm2 restart $APP_NAME
else
    pm2 start ecosystem.config.js
fi

pm2 save

# 6. 健康检查
log_info "等待应用启动..."
sleep 5

if curl -f http://localhost:33001 > /dev/null 2>&1; then
    log_info "✅ 应用启动成功！"
else
    log_error "❌ 应用启动失败，请检查日志"
    pm2 logs $APP_NAME --lines 50
    exit 1
fi

# 7. 显示状态
log_info "应用状态："
pm2 status

log_info ""
log_info "✅ 部署完成！"
log_info ""
log_info "常用命令："
log_info "- 查看日志: pm2 logs $APP_NAME"
log_info "- 查看状态: pm2 status"
log_info "- 重启应用: pm2 restart $APP_NAME"
log_info "- 停止应用: pm2 stop $APP_NAME"
