# XHS-Runner 开发环境配置指南

## 常见问题及解决方案

### 1. Electron 安装失败

**问题原因**：
- Electron 需要下载大型二进制文件（~100MB）
- 默认从 GitHub releases 下载，国内网络经常失败

**解决方案**：
项目已配置 `.npmrc` 文件使用国内镜像，自动解决此问题。

如果仍然失败，手动执行：
```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

### 2. 数据库连接失败

**问题原因**：
- 未配置 Postgres 连接串
- 连接串错误或网络不可达

**解决方案**：
在 `.env.local` 中配置 `DATABASE_URL`（或 `POSTGRES_URL`）。迁移导出脚本可用 `SUPABASE_DB_URL`。

示例（请替换为你自己的连接串）：
```bash
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>
```

### 3. Next.js 构建缓存问题

**问题原因**：
- `.next` 目录缓存损坏

**解决方案**：
```bash
rm -rf .next
npm run dev
```

## 首次安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd XHS-Runner

# 2. 安装依赖（会自动执行 postinstall 脚本）
npm install

# 3. 启动开发服务器
npm run dev
```

## 重新安装依赖

如果遇到任何问题，完全重新安装：

```bash
# 清理所有缓存和依赖
rm -rf node_modules package-lock.json .next
npm cache clean --force

# 重新安装
npm install

# 启动
npm run dev
```

## 配置说明

### .npmrc 文件
- 配置 npm registry（某些环境下 `npmmirror` DNS 不可达时需切换）
- 自动应用于所有 npm 操作

### package.json 脚本
- `dev`: 启动开发服务器
- `build:server`: 编译服务层到 `electron/server/`

## 故障排查

### Electron 窗口无法打开
1. 检查 Next.js 是否正常启动（http://localhost:3000）
2. 检查控制台是否有错误信息

### 数据库错误
1. 确认 `DATABASE_URL` 可用且格式正确
2. 检查网络与数据库权限
3. 重新启动应用

### Drizzle 连接错误（`Drizzle db is not configured`）
当前项目的 Drizzle ORM 需要 **Postgres 连接串**（本地或远程均可；迁移导出脚本可选 `SUPABASE_DB_URL`）。

解决方案：在你的环境里配置 `DATABASE_URL`（推荐写在 `.env.local`，该文件已在 `.gitignore` 中）。

示例（请替换为你自己的连接串）：
```bash
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>
```

### 端口占用
```bash
# 查找占用 3000 端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>
```

## 技术栈版本

- Node.js: v20.19.5
- Electron: ^30.0.6
- Next.js: 14.2.5
- React: 18.3.1

## 注意事项

1. **不要删除 .npmrc 文件**：它确保 Electron 能正确下载
2. **切换 Node.js 版本后**：需要重新安装依赖
3. **Electron 版本更新后**：需要重新安装依赖
