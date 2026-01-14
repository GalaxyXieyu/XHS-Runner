---
mode: test_guide
project: xhs-generator
created_at: 2026-01-14
---

# Idea 一键生成：测试路径（smoke / API / UI）

目标：把“能跑起来/能回归”的路径落盘，避免口口相传导致跑偏。

## 0. 安全约束（必须遵守）

- 不要把任何真实密钥写进仓库、命令行历史或截图（例如 `sk-...`、access_key、token）。
- 建议通过 `.env.local` 或系统环境变量注入密钥；curl 示例里不要填真实 key。

## 1. Smoke（脚本）

### 1.1 风格模板 smoke

```bash
npx tsx src/server/scripts/styleTemplateSmoke.ts
```

预期：

- 能列出内置风格模板（8 个左右）
- 若 LLM 未配置：会提示 `LLM 调用失败 (可能未配置)`，但脚本仍可继续完成其余检查
- `listContentPackages/getContentPackage` 能返回结构（creative/assets/tasks）

## 2. API（curl）

### 2.1 Preview：`POST /api/generate/preview`

```bash
curl -X POST http://localhost:3000/api/generate/preview \\
  -H 'content-type: application/json' \\
  -d '{"idea":"秋天的咖啡馆","styleKey":"cozy","aspectRatio":"3:4","count":4}'
```

预期：

- 200 返回 `prompts` 数组
- 400 返回 `IDEA_PREVIEW_BAD_REQUEST: ...`

### 2.2 Confirm：`POST /api/generate/confirm`

```bash
curl -X POST http://localhost:3000/api/generate/confirm \\
  -H 'content-type: application/json' \\
  -d '{"prompts":["p1","p2"],"model":"nanobanana"}'
```

预期：

- 200 返回 `creativeId` 与 `taskIds`
- 400 返回 `IDEA_CONFIRM_BAD_REQUEST: ...`

### 2.3 风格模板 API：`GET/POST /api/style-templates`

```bash
curl http://localhost:3000/api/style-templates
```

```bash
curl -X POST http://localhost:3000/api/style-templates \\
  -H 'content-type: application/json' \\
  -d '{"key":"my-style-1","name":"我的模板","systemPrompt":"..."}'
```

预期：

- GET 返回模板列表（不包含 `systemPrompt`）
- POST 成功创建后，再 GET 能看到新模板

## 3. UI（手工）

### 3.1 启动

```bash
npm run dev
```

或只跑 renderer（如果你只需要 UI）：

```bash
npm run dev:next
```

### 3.2 关键路径（Idea 一键生成）

1. 打开应用 → `CreativeTab`
2. 选择 `Idea 一键生成`
3. 输入 idea，选择风格/比例/数量
4. 点击 `生成预览`
5. 编辑 prompts（上移/下移/删除/新增）
6. 点击 `确认生成` → 弹窗 `确认入队`
7. 观察生成进度：任务状态变化、进度条推进、图片缩略图逐步出现

验收口径（可见证据）：

- 不会因为重复点击导致多次入队（按钮禁用 + UI 提示）
- 有失败任务时 UI 能显示失败状态（红色/failed）
- 图片生成后能通过 `/api/assets/:id` 正常展示

## 4. Chrome MCP（可选，录制回归证据）

本仓库不强依赖 MCP，但如果你有 Chrome MCP 工具链，建议录制以下路径并保存截图：

- 输入 idea → 预览 → 编辑 prompts → 确认入队 → 进度更新 → 图片出现

记录建议：

- 截图命名包含时间戳与 creativeId
- 不要在截图里暴露任何密钥/账号信息

