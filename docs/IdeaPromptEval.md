---
mode: eval
project: xhs-generator
created_at: 2026-01-14
---

# 提示词质量评估与迭代（Idea 一键生成）

目标：用固定样本集 + 固定参数生成 prompts，形成可重复的对比口径，避免“主观争论”。

## 1. 样本集（v1）

默认内置在脚本里（可按需调整）：

- 秋天的咖啡馆：暖色调、窗边光影、治愈氛围
- 通勤穿搭：简洁干净的搭配示例，实用可复制
- 周末露营清单：氛围感布置与必备物品
- 平价护肤：学生党友好、重点成分讲清楚
- 家居收纳：小空间也能变整洁的技巧
- 低卡早餐：高颜值又简单易做
- 学习效率：番茄钟+复盘的日常展示
- 旅行攻略：城市漫步路线与拍照点位

## 2. 评估口径（建议）

每轮评估建议记录：

- **一致性**：同一风格下，prompts 是否保持稳定的语气、结构与画面信息密度
- **差异性**：不同风格之间是否能拉开视觉表现（而非换个词）
- **风格符合度**：是否符合“小红书配图”审美（构图、光线、细节、氛围）
- **可用性**：prompt 是否可直接喂给图像模型（避免无意义抽象词、缺少主体/场景/镜头信息）
- **鲁棒性**：LLM 偶发返回非数组/杂质文本时是否可定位与解释

## 3. 执行方法（脚本输出 JSONL）

```bash
npx tsx src/server/scripts/ideaPromptEval.ts
```

自定义参数：

```bash
npx tsx src/server/scripts/ideaPromptEval.ts --count 4 --styles cozy,photo,minimal --aspectRatio 3:4
```

输出说明：

- 第一段为 `meta`（参数）
- 每条结果为 `result`（idea/styleKey/prompts）
- 失败为 `error`（包含 error message）
- 最后输出 `summary`

你可以把输出重定向保存（不要提交生成产物）：

```bash
npx tsx src/server/scripts/ideaPromptEval.ts > /tmp/idea-prompt-eval.jsonl
```

## 4. 迭代记录模板（建议手工维护）

每一轮在 PR/会议里落盘：

- 变更点：调整了哪些模板/哪些提示词逻辑
- 证据：`/tmp/idea-prompt-eval.jsonl`（或同类产物路径）对比摘要
- 结论：一致性/差异性/风格符合度是否提升
- 下一步：要继续改的 1–3 个点（小步快跑）

## 5. 安全注意

- 不要在脚本参数、日志或文档里放真实密钥（例如 `sk-...`、access_key、token）。
- 如果需要线上模型，统一通过 `.env.local`/环境变量配置。

