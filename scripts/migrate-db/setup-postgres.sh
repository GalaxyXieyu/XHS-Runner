#!/bin/bash
# PostgreSQL 生产环境配置脚本
#
# 功能：
# - 安装 PostgreSQL
# - 创建数据库和用户
# - 配置远程访问
# - 启动服务
#
# 使用方法：
#   ssh xhs-prod "bash -s" < scripts/migrate-db/setup-postgres.sh

set -e

echo "=========================================="
echo "PostgreSQL 生产环境配置"
echo "=========================================="

# 配置变量
DB_NAME="xhs_generator"
DB_USER="xhs_admin"
DB_PASSWORD="xhs_prod_$(openssl rand -base64 16 | tr -d '=+/')"
DB_PORT=5432
PG_VERSION="15"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "ℹ $1"
}

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    print_error "无法检测操作系统"
    exit 1
fi

print_info "检测到操作系统: $OS"

# 安装 PostgreSQL
install_postgres() {
    print_info "安装 PostgreSQL $PG_VERSION..."

    case $OS in
        ubuntu|debian)
            # 更新包列表
            apt-get update -qq

            # 安装 PostgreSQL（优先指定版本，失败则退回系统默认版本）
            set +e
            apt-get install -y postgresql-$PG_VERSION postgresql-contrib-$PG_VERSION
            INSTALL_STATUS=$?
            set -e

            if [ $INSTALL_STATUS -ne 0 ]; then
                print_warning "未找到 PostgreSQL $PG_VERSION，尝试安装系统默认版本..."
                apt-get install -y postgresql postgresql-contrib
                PG_VERSION="$(psql -V | awk '{print $3}' | cut -d. -f1)"
                print_info "已安装 PostgreSQL ${PG_VERSION}"
            fi

            # 启动服务
            systemctl start postgresql
            systemctl enable postgresql

            print_success "PostgreSQL 安装完成"
            ;;
        centos|rhel|rocky|almalinux)
            # 安装 PostgreSQL 仓库
            dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm

            # 安装 PostgreSQL
            dnf install -y postgresql$PG_VERSION postgresql$PG_VERSION-server postgresql$PG_VERSION-contrib

            # 初始化数据库
            /usr/pgsql-$PG_VERSION/bin/postgresql-$PG_VERSION-setup initdb

            # 启动服务
            systemctl start postgresql-$PG_VERSION
            systemctl enable postgresql-$PG_VERSION

            print_success "PostgreSQL 安装完成"
            ;;
        *)
            print_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac
}

# 创建数据库和用户
create_database() {
    print_info "创建数据库和用户..."

    # 获取 postgres 用户的主目录
    PG_HBA_FILE="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
    PG_CONF_FILE="/etc/postgresql/$PG_VERSION/main/postgresql.conf"

    # CentOS/RHEL 路径不同
    if [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "rocky" ] || [ "$OS" = "almalinux" ]; then
        PG_HBA_FILE="/var/lib/pgsql/$PG_VERSION/data/pg_hba.conf"
        PG_CONF_FILE="/var/lib/pgsql/$PG_VERSION/data/postgresql.conf"
        PG_DATA="/var/lib/pgsql/$PG_VERSION/data"
        PG_BIN="/usr/pgsql-$PG_VERSION/bin"
    else
        PG_DATA="/var/lib/postgresql/$PG_VERSION/main"
        PG_BIN="/usr/lib/postgresql/$PG_VERSION/bin"
    fi

    # 执行 SQL 命令创建数据库和用户
    sudo -u postgres psql << EOF
-- 创建用户
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- 创建数据库
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- 授权
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

\c $DB_NAME

-- 授予 schema 权限
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF

    print_success "数据库和用户创建完成"
}

# 配置远程访问
configure_remote_access() {
    print_info "配置远程访问..."

    PG_HBA_FILE="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
    PG_CONF_FILE="/etc/postgresql/$PG_VERSION/main/postgresql.conf"

    if [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "rocky" ] || [ "$OS" = "almalinux" ]; then
        PG_HBA_FILE="/var/lib/pgsql/$PG_VERSION/data/pg_hba.conf"
        PG_CONF_FILE="/var/lib/pgsql/$PG_VERSION/data/postgresql.conf"
    fi

    # 备份原配置
    cp "$PG_HBA_FILE" "${PG_HBA_FILE}.backup.$(date +%Y%m%d%H%M%S)"
    cp "$PG_CONF_FILE" "${PG_CONF_FILE}.backup.$(date +%Y%m%d%H%M%S)"

    # 修改 pg_hba.conf 允许密码认证
    # 添加本地认证和远程认证规则
    if ! grep -q "host $DB_NAME $DB_USER 0.0.0.0/0 scram-sha-256" "$PG_HBA_FILE"; then
        echo "" >> "$PG_HBA_FILE"
        echo "# XHS Generator access" >> "$PG_HBA_FILE"
        echo "host    $DB_NAME    $DB_USER    0.0.0.0/0    scram-sha-256" >> "$PG_HBA_FILE"
    fi

    # 修改 postgresql.conf 监听所有地址
    sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF_FILE" || \
    sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF_FILE" || \
    echo "listen_addresses = '*'" >> "$PG_CONF_FILE"

    # 重启 PostgreSQL
    systemctl restart postgresql || systemctl restart postgresql-$PG_VERSION

    print_success "远程访问配置完成"
}

# 配置防火墙
configure_firewall() {
    print_info "配置防火墙..."

    if command -v ufw &> /dev/null; then
        # Ubuntu/Debian - ufw
        ufw allow 5432/tcp
        print_success "UFW 防火墙规则已添加"
    elif command -v firewall-cmd &> /dev/null; then
        # CentOS/RHEL - firewalld
        firewall-cmd --permanent --add-port=5432/tcp
        firewall-cmd --reload
        print_success "Firewalld 防火墙规则已添加"
    elif command -v iptables &> /dev/null; then
        # iptables
        iptables -A INPUT -p tcp --dport 5432 -j ACCEPT
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || \
        iptables-save > /etc/sysconfig/iptables 2>/dev/null || true
        print_success "iptables 规则已添加"
    else
        print_warning "未检测到防火墙，请手动开放 5432 端口"
    fi
}

# 优化 PostgreSQL 配置
optimize_postgres() {
    print_info "优化 PostgreSQL 配置..."

    PG_CONF_FILE="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
    if [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "rocky" ] || [ "$OS" = "almalinux" ]; then
        PG_CONF_FILE="/var/lib/pgsql/$PG_VERSION/data/postgresql.conf"
    fi

    # 根据可用内存优化
    MEMORY_GB=$(free -g | awk '/^Mem:/{print $2}')
    MEMORY_MB=$((MEMORY_GB * 1024))

    # 添加优化配置（如果不存在）
    CONFIG_FILE="/tmp/postgres-optimize.conf"

    cat > "$CONFIG_FILE" << EOF

# ============================================
# XHS Generator Optimization
# Generated: $(date)
# ============================================

# 连接设置
max_connections = 100

# 内存设置
shared_buffers = ${MEMORY_MB}MB        # 25% of RAM
effective_cache_size = $((MEMORY_MB * 3))MB  # 75% of RAM
work_mem = 4MB
maintenance_work_mem = 64MB

# 检查点设置
checkpoint_completion_target = 0.9
wal_buffers = 16MB

# 查询优化
random_page_cost = 1.1
effective_io_concurrency = 200

# 日志设置
log_min_duration_statement = 1000
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# 时区
timezone = 'UTC'

# 编码
client_encoding = 'UTF8'
EOF

    # 将优化配置追加到 postgresql.conf
    if ! grep -q "XHS Generator Optimization" "$PG_CONF_FILE"; then
        cat "$CONFIG_FILE" >> "$PG_CONF_FILE"
        systemctl restart postgresql || systemctl restart postgresql-$PG_VERSION
        print_success "PostgreSQL 优化完成"
    else
        print_warning "优化配置已存在，跳过"
    fi

    rm -f "$CONFIG_FILE"
}

# 显示数据库信息
show_info() {
    echo ""
    echo "=========================================="
    echo "PostgreSQL 配置完成"
    echo "=========================================="
    echo ""
    echo "数据库信息:"
    echo "  数据库名:    $DB_NAME"
    echo "  用户名:      $DB_USER"
    echo "  端口:        $DB_PORT"
    echo ""
    echo "连接字符串:"
    echo "  postgresql://$DB_USER:<PASSWORD>@<SERVER_IP>:$DB_PORT/$DB_NAME"
    echo ""
    echo "⚠️  请妥善保存以下密码:"
    echo "  $DB_PASSWORD"
    echo ""
    echo "将以下配置添加到 .env.production:"
    echo "  DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:$DB_PORT/$DB_NAME"
    echo ""
    echo "=========================================="
}

# 主流程
main() {
    # 检查是否已安装
    if command -v psql &> /dev/null; then
        print_warning "PostgreSQL 已安装"
        read -p "是否重新配置? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 0
        fi
    fi

    # 安装
    install_postgres

    # 创建数据库
    create_database

    # 配置远程访问
    configure_remote_access

    # 配置防火墙
    configure_firewall

    # 优化配置
    optimize_postgres

    # 显示信息
    show_info
}

# 执行
main "$@"
