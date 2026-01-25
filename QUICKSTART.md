# 🚀 XHS-Generator 快速部署指南

## 服务器信息

- **IP**: 38.76.195.125
- **用户**: root
- **初始密码**: ejebJLNC0398
- **端口**: 33001

## 一键部署（3 步完成）

### 第 1 步：配置 SSH 自动连接

```bash
# 运行 SSH 配置脚本
./scripts/setup-ssh.sh
```

这个脚本会自动：
- ✅ 生成 SSH 密钥对
- ✅ 上传公钥到服务器
- ✅ 配置 SSH config（可以直接用 `ssh xhs-prod` 连接）
- ✅ 测试连接

完成后，你可以直接使用：
```bash
ssh xhs-prod
```

### 第 2 步：初始化服务器

```bash
# 上传初始化脚本
scp scripts/init-server.sh xhs-prod:/root/

# 运行初始化
ssh xhs-prod "chmod +x /root/init-server.sh && /root/init-server.sh"
```

初始化脚本会自动安装：
- Node.js 20 + pnpm + PM2
- Nginx（反向代理到 33001 端口）
- UFW 防火墙
- fail2ban 防暴力破解

### 第 3 步：首次部署

```bash
# 1. 克隆项目到服务器
ssh xhs-prod "cd /var/www/xhs-generator && git clone https://github.com/your-username/xhs-generator.git ."

# 2. 配置环境变量
ssh xhs-prod "cd /var/www/xhs-generator && cp .env.production.example .env.production"

# 编辑环境变量（填写实际值）
ssh xhs-prod "nano /var/www/xhs-generator/.env.production"

# 3. 运行部署
ssh xhs-prod "cd /var/www/xhs-generator && chmod +x scripts/deploy.sh && ./scripts/deploy.sh"
```

## 配置 GitHub Actions 自动部署

### 1. 复制 SSH 私钥

```bash
# 复制私钥到剪贴板（macOS）
cat ~/.ssh/xhs_deploy | pbcopy

# 或者查看私钥内容
cat ~/.ssh/xhs_deploy
```

### 2. 添加 GitHub Secrets

进入 GitHub 仓库 → Settings → Secrets and variables → Actions，添加：

| Secret Name | Value |
|-------------|-------|
| `SERVER_HOST` | `38.76.195.125` |
| `SERVER_USER` | `root` |
| `SSH_PRIVATE_KEY` | 粘贴私钥内容 |
| `DATABASE_URL` | `postgresql://...` |

### 3. 推送代码触发部署

```bash
git add .
git commit -m "feat: setup CI/CD"
git push origin main
```

## 常用命令

```bash
# 连接服务器
ssh xhs-prod

# 查看应用状态
ssh xhs-prod "pm2 status"

# 查看日志
ssh xhs-prod "pm2 logs xhs-generator --lines 50"

# 重启应用
ssh xhs-prod "pm2 restart xhs-generator"

# 手动部署
ssh xhs-prod "cd /var/www/xhs-generator && ./scripts/deploy.sh"

# 查看 Nginx 日志
ssh xhs-prod "tail -f /var/log/nginx/xhs-generator-access.log"
```

## 访问应用

部署完成后，访问：
- **HTTP**: http://38.76.195.125
- **应用端口**: 33001（通过 Nginx 反向代理）

## 故障排查

### 应用无法启动

```bash
# 检查端口占用
ssh xhs-prod "sudo lsof -i :33001"

# 查看 PM2 日志
ssh xhs-prod "pm2 logs xhs-generator --lines 100"

# 查看环境变量
ssh xhs-prod "pm2 env 0"
```

### Nginx 502 错误

```bash
# 检查应用是否运行
ssh xhs-prod "pm2 status"

# 检查 Nginx 配置
ssh xhs-prod "sudo nginx -t"

# 查看 Nginx 错误日志
ssh xhs-prod "sudo tail -f /var/log/nginx/error.log"
```

### SSH 连接失败

```bash
# 测试密钥连接
ssh -i ~/.ssh/xhs_deploy root@38.76.195.125

# 查看详细连接信息
ssh -v xhs-prod
```

## 安全建议

1. **首次部署后立即禁用密码登录**
   ```bash
   ssh xhs-prod "sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl restart sshd"
   ```

2. **定期更新系统**
   ```bash
   ssh xhs-prod "sudo apt update && sudo apt upgrade -y"
   ```

3. **监控 fail2ban 状态**
   ```bash
   ssh xhs-prod "sudo fail2ban-client status sshd"
   ```

## 下一步

- [ ] 配置域名和 HTTPS（如果有域名）
- [ ] 设置监控告警
- [ ] 配置自动备份
- [ ] 添加性能监控

## 详细文档

- [CI-CD.md](CI-CD.md) - 完整的 CI/CD 部署指南
- [DEPLOYMENT.md](DEPLOYMENT.md) - 详细的手动部署文档
- [CLAUDE.md](CLAUDE.md) - 项目状态和数据库操作
