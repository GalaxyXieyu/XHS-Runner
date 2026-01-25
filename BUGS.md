# Bug 追踪文档

## Bug #1: 生成的图片未入库

**发现时间**: 2026-01-25

**严重程度**: 🔴 高 - 导致生成的内容无法正常显示

### 问题描述

图片生成后只保存在文件系统中，没有创建数据库记录，导致：
1. 图片无法通过 API 访问
2. 素材库显示占位符而非实际图片
3. creative 和 assets 之间没有关联关系

### 复现步骤

1. 使用 Agent 创建内容并生成图片
2. 图片生成成功（保存在 `public/generated/` 目录）
3. 查看素材库 - 显示占位符图标
4. 检查数据库 `assets` 表 - 没有对应记录

### 根本原因

**位置**: `src/server/agents/nodes/imageNode.ts` (lines 45-88)

```typescript
// 当前实现：只保存到文件系统
const imagePath = path.join(outputDir, filename);
fs.writeFileSync(imagePath, result.imageBuffer);
generatedPaths.push(imagePath);

// ❌ 缺失：没有调用 storeAsset() 创建数据库记录
// ❌ 缺失：没有创建 creative_assets 关联
```

### 正确的实现模式

参考 `src/server/services/xhs/llm/generationQueue.ts` (lines 195-253):

```typescript
// 1. 保存 asset 到数据库
const asset = await storeAsset({
  type: 'image',
  filename,
  data: result.imageBuffer,
  metadata: { prompt, text, ...metadata },
});

// 2. 创建或更新 creative
const [created] = await db.insert(schema.creatives).values({
  themeId, sourceTopicId, title, content, status: 'draft',
  resultAssetId: asset.id,  // 关联主图
}).returning({ id: schema.creatives.id });

// 3. 创建 creative_assets 关联
await db.insert(schema.creativeAssets).values({
  creativeId: finalCreativeId,
  assetId: asset.id,
});
```

### 影响范围

- ✅ 图片生成功能正常
- ✅ 文件系统保存正常
- ❌ 数据库 `assets` 表缺少记录
- ❌ 数据库 `creative_assets` 表缺少关联
- ❌ API `/api/assets/:id` 无法访问图片
- ❌ 素材库无法显示图片

### 解决方案

**需要修改的文件**: `src/server/agents/nodes/imageNode.ts`

**步骤**:
1. 导入 `storeAsset` 函数
2. 导入数据库 schema 和 db client
3. 在图片生成后调用 `storeAsset()` 创建 asset 记录
4. 获取或创建 `creativeId`（可能需要从 state 传递）
5. 创建 `creative_assets` 关联
6. 在 state 中保存 asset IDs 而非文件路径

**关键代码位置**:
- Asset 存储工具: `src/server/services/xhs/integration/assetStore.ts`
- 数据库 Schema: `src/server/db/schema.ts` (assets, creatives, creative_assets)
- 参考实现: `src/server/services/xhs/llm/generationQueue.ts`

---

## Bug #2: 没有图片的帖子也入库了

**发现时间**: 2026-01-25

**严重程度**: 🟡 中 - 导致素材库显示不完整的内容

### 问题描述

即使图片还没有生成完成，creative 记录也会被保存到数据库，导致素材库显示占位符内容。

### 用户需求

> "如果没有生成图片这个帖子就不要入库"

### 当前行为

1. writer_agent 完成后立即保存 creative（有标题和正文）
2. 此时图片还没有生成
3. 素材库显示不完整的内容

### 期望行为

1. writer_agent 完成后不立即保存
2. 等待所有图片生成完成
3. 图片入库后，再保存 creative 并关联图片
4. 素材库只显示完整的内容（有图片）

### 解决方案

**选项 1: 延迟保存 creative**
- 在 review_agent 审核通过后再保存
- 确保此时所有图片已生成并入库
- 一次性创建 creative 和所有关联

**选项 2: 添加状态字段**
- creative 添加 `hasImages` 布尔字段
- 初始保存时设为 false
- 图片全部入库后更新为 true
- 素材库查询时过滤 `hasImages = false` 的记录

**推荐**: 选项 1 - 更简单，避免中间状态

### 需要修改的位置

1. `src/server/agents/utils/streamProcessor.ts` - 移除 writer_agent 完成后的保存逻辑
2. `src/server/agents/nodes/reviewNode.ts` - 在审核通过后保存完整的 creative
3. 或者在 image_agent 完成后保存

---

## 修复优先级

1. **Bug #1** (高优先级) - 图片入库功能
2. **Bug #2** (中优先级) - 延迟保存 creative

## 测试计划

### Bug #1 修复后测试
1. 生成新内容
2. 检查 `assets` 表是否有新记录
3. 检查 `creative_assets` 表是否有关联
4. 访问 `/api/assets/:id` 是否返回图片
5. 素材库是否正确显示图片

### Bug #2 修复后测试
1. 生成新内容
2. 在图片生成前检查数据库 - 应该没有 creative 记录
3. 图片生成完成后检查 - 应该有完整的 creative + assets
4. 素材库只显示完整内容

---

## 相关文件清单

### 需要修改
- `src/server/agents/nodes/imageNode.ts` - 添加图片入库逻辑
- `src/server/agents/utils/streamProcessor.ts` - 调整保存时机
- `src/server/agents/nodes/reviewNode.ts` - 可能需要添加保存逻辑

### 参考文件
- `src/server/services/xhs/integration/assetStore.ts` - Asset 存储工具
- `src/server/services/xhs/llm/generationQueue.ts` - 正确的实现模式
- `src/server/db/schema.ts` - 数据库表结构

### 数据库表
- `assets` - 存储文件元数据
- `creatives` - 存储创作内容
- `creative_assets` - 关联表（多对多）

---

## 更新日志

- 2026-01-25: 初始创建，记录两个关键 bug
