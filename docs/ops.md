# 运维与提示词更新（Ops & Prompt）

本文件聚焦 **部署/发布** 与 **Prompt 更新**，同时保留必要的开发/验证命令。

## 1. 开发与验证

### 本地开发
- `npm run dev`
- `npm run dev:next`
- `npm run dev:electron`

### 构建
- `npm run build:server`
- `npm run build`

### Agent 流回归
- `npm run lint:supervisor-prompt`
- `npm run eval:agent-clarification`
- `npm run eval:clarification -- --baseUrl=http://localhost:3000`

### Smoke Test
- `npm test`

## 2. Prompt 更新流程

1. 修改 `prompts/*.yaml`
2. 同步到 Langfuse：
   - `npx tsx scripts/sync-prompts-to-langfuse.ts`
3. 触发一次实际流程验证（确保新 prompt 生效）

**注意**：不要直接在代码里硬编码 prompt。

## 3. 部署（生产/测试环境）

### 3.1 基本流程（示意）
1. 构建产物
   - `npm run build`
2. 打包桌面应用（如果需要）
   - `npm run dist` / `npm run pack`
3. 服务器部署
   - 上传构建产物到服务器
   - 解压并重启进程管理器（如 PM2）

> 说明：具体服务器地址、账号与密钥请保存在私有配置中，文档内只保留模板。

### 3.2 服务器初始化模板（安全占位）
- 服务器 IP：`<SERVER_IP>`
- SSH 用户：`<SSH_USER>`
- 部署目录：`/var/www/xhs-generator`（可自定义）

### 3.3 环境变量示例（模板）
```
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/xhs_generator"
LLM_BASE_URL="https://api.openai.com/v1"
LLM_API_KEY="<YOUR_KEY>"
LLM_MODEL="gpt-4"
LANGFUSE_SECRET_KEY="<YOUR_KEY>"
LANGFUSE_PUBLIC_KEY="<YOUR_KEY>"
LANGFUSE_HOST="https://cloud.langfuse.com"
NODE_ENV=production
PORT=33001
```

## 4. CI/CD（GitHub Actions）

### 4.1 必要 Secrets（模板）
- `SERVER_HOST`
- `SERVER_USER`
- `SSH_PRIVATE_KEY`
- `DATABASE_URL`

### 4.2 常见检查点
- 构建失败：检查 Node 版本、依赖安装与环境变量
- 健康检查失败：确认服务已启动且端口可达
- SSE 断流：检查反向代理超时配置

## 5. 发布前检查清单（简版）

- [ ] `npm run build:server`
- [ ] `npm run lint:supervisor-prompt`
- [ ] `npm run eval:agent-clarification`
- [ ] 确认 prompt 已同步到 Langfuse

