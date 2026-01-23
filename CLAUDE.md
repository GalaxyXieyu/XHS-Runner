# XHS-Runner 项目状态


## 已完成功能

### 核心功能
- [x] Electron + Next.js 桌面应用架构
- [x] 小红书登录（扫码/Cookie）
- [x] 多主题管理（创建/编辑/删除）
- [x] 多关键词抓取（每主题支持多个关键词）
- [x] 笔记抓取与存储（Postgres / Supabase）

### 数据洞察 (InsightTab)
- [x] 热门标签提取（中文正则 + 互动加权排序）
- [x] 爆款标题 Top10 展示（点赞/收藏/评论）
- [x] AI 标题分析（LLM 总结爆款规律）
- [x] 趋势报告生成（今日 vs 昨日对比）
- [x] 筛选功能（时间范围 + 排序方式）
- [x] 热门笔记卡片展示

### 设置功能
- [x] LLM API 配置（Base URL / API Key / Model）
- [x] 配置持久化存储

### API 层
- [x] `/api/insights` - 获取洞察数据
- [x] `/api/insights/analyze` - AI 标题分析
- [x] `/api/insights/trend` - 趋势报告

## 未完成功能

### 高优先级
- [ ] 视频笔记过滤（只分析图文笔记）
- [ ] 词云可视化（基于标签数据）
- [ ] 抓取后自动触发 AI 分析

### 中优先级
- [ ] 历史趋势图表（7天/30天折线图）
- [ ] 标签点击筛选（点击标签过滤笔记）
- [ ] 笔记详情弹窗
- [ ] 数据导出（CSV/Excel）

### 低优先级
- [ ] 多语言支持
- [ ] 深色模式
- [ ] 笔记收藏功能
- [ ] 竞品账号监控

## 技术栈

- Frontend: React + TypeScript + Tailwind CSS
- Backend: Next.js API Routes + Postgres (Supabase) + Drizzle
- Desktop: Electron
- LLM: 可配置（支持 OpenAI 兼容 API）

## 数据库表

### 核心业务表
| 表名 | 说明 | 记录数 |
|------|------|--------|
| `themes` | 主题管理 | 1 |
| `keywords` | 关键词配置 | 5 |
| `topics` | 抓取的笔记 | 160 |
| `creatives` | 创意内容 | 58 |
| `assets` | 资源文件 | 79 |

### 任务调度表
| 表名 | 说明 |
|------|------|
| `scheduled_jobs` | 定时任务配置 |
| `job_executions` | 任务执行记录 |
| `generation_tasks` | 生成任务队列 |

### 配置表
| 表名 | 说明 |
|------|------|
| `settings` | 应用配置 |
| `llm_providers` | LLM 服务商配置 |
| `prompt_profiles` | Prompt 模板 |
| `image_style_templates` | 图片风格模板 |
| `agent_prompts` | Multi-Agent 系统 Prompt（Langfuse 同步） |

### 其他表
`accounts`, `competitors`, `publish_records`, `metrics`, `interaction_tasks`, `form_assist_records`, `trend_reports`, `creative_assets`, `rate_limit_state`

## Multi-Agent Prompt 管理

### 架构设计

**数据源优先级**：Langfuse > 数据库缓存 > 代码默认值

```
┌─────────────┐     同步      ┌─────────────┐
│  Langfuse   │ ───────────→ │   数据库    │
│ (主数据源)   │ ←─────────── │  (缓存)     │
└─────────────┘    上传       └─────────────┘
       ↑                            ↓
       │                      ┌─────────────┐
       └──────────────────────│ Agent 系统  │
                              └─────────────┘
```

### Langfuse Prompt 命名规范

在 Langfuse 中创建 prompt 时，使用 `xhs-agent-{agent_name}` 格式：

| Agent | Langfuse Prompt Name |
|-------|---------------------|
| supervisor | `xhs-agent-supervisor` |
| research_agent | `xhs-agent-research_agent` |
| writer_agent | `xhs-agent-writer_agent` |
| style_analyzer_agent | `xhs-agent-style_analyzer_agent` |
| image_planner_agent | `xhs-agent-image_planner_agent` |
| image_agent | `xhs-agent-image_agent` |
| review_agent | `xhs-agent-review_agent` |

### 工作流程
1. **修改 Prompt**：编辑 `prompts/` 目录下的对应 YAML 文件 (`.yaml`)
2. **同步 Prompt**：执行 `npx tsx scripts/sync-prompts-to-langfuse.ts`
   - 此脚本会自动解析 YAML 文件
   - 上传到 Langfuse (Production 标签)
   - 同步到本地数据库缓存
3. **验证 Prompt**：脚本执行完成后会输出当前的 prompt 内容进行验证

### 相关文件
- `prompts/*.yaml` - Prompt 定义文件 (Single Source of Truth)
- `scripts/sync-prompts-to-langfuse.ts` - 同步脚本
- `src/server/services/promptManager.ts` - Prompt 管理服务
- 数据库表：`agent_prompts`

### Agent Prompt 调试心法

#### 修改流程

```
观察异常行为 → 追踪代码流程 → 定位根因 → 验证假设 → 精确修改
```

#### 核心原则

**① 状态-决策对应原则**
- Prompt 中的决策规则必须与代码中的 `state.xxx` 变量一一对应
- 例如：`imagesComplete = true` → prompt 必须明确说 "图片已完成 → review_agent"

**② 优先级明确原则**
```yaml
# 错误示例（模糊）
决策规则：按工作流程顺序执行

# 正确示例（明确优先级）
决策规则（按优先级）：
1. 迭代次数 >= 最大次数 → END
2. 审核通过 → END
3. 图片已完成 + 未审核 → review_agent
4. 图片未完成 + 已规划 → image_agent
```

**③ 状态组合覆盖原则**
- 列出所有可能的状态组合，每个组合都有明确的下一步
- 避免"漏网之鱼"导致循环或死锁

#### 修改触发条件

| 现象 | 可能原因 | 修改方向 |
|------|---------|---------|
| 循环执行 | 缺少终止条件 | 添加 "xxx完成 → 下一阶段" |
| 跳过步骤 | 优先级错误 | 调整决策规则顺序 |
| 死锁 | 状态组合未覆盖 | 补充缺失的决策分支 |
| 重复调用 | 完成状态未检查 | 添加 "已完成 → 跳过" |

#### 修改方式

通过 Supabase MCP 直接修改数据库中的 prompt：

```sql
UPDATE agent_prompts
SET system_prompt = '新的 prompt 内容',
    version = version + 1,
    updated_at = NOW()
WHERE agent_name = 'supervisor';
```

#### 最佳实践

1. **Prompt 和代码双重保障** - 代码检查状态 + prompt 明确指令
2. **日志驱动调试** - 通过日志定位 prompt 实际输出了什么
3. **最小化修改** - 只改必要的决策规则，不重写整个 prompt
4. **版本追踪** - 每次修改 `version + 1`，便于回滚

## 数据库操作 (推荐使用 Supabase MCP)

> ⚠️ **推荐方式**: 使用 Supabase MCP 进行数据库操作，无需手动编写脚本，直接在 Claude Code 中执行。

### Supabase MCP 配置

项目 ID: `emfhfxayynshmgkxdccb`

### 常用 MCP 操作

```yaml
# 查看表结构
mcp__supabase__list_tables:
  project_id: emfhfxayynshmgkxdccb
  schemas: ["public"]

# 执行 SQL 查询
mcp__supabase__execute_sql:
  project_id: emfhfxayynshmgkxdccb
  query: "SELECT * FROM topics ORDER BY like_count DESC LIMIT 10"

# 执行 DDL 迁移
mcp__supabase__apply_migration:
  project_id: emfhfxayynshmgkxdccb
  name: "add_new_column"
  query: "ALTER TABLE topics ADD COLUMN new_field TEXT"
```

### 常用查询示例

```sql
-- 热门笔记 Top 10
SELECT title, author_name, like_count, collect_count
FROM topics ORDER BY like_count DESC LIMIT 10;

-- 按主题统计笔记数
SELECT t.name, COUNT(tp.id) as count
FROM themes t LEFT JOIN topics tp ON t.id = tp.theme_id
GROUP BY t.id;

-- 查看任务执行状态
SELECT status, COUNT(*) FROM job_executions GROUP BY status;

-- 查看生成任务状态
SELECT status, COUNT(*) FROM generation_tasks GROUP BY status;
```

### 备选方式: Drizzle ORM

```bash
# 仅在 MCP 不可用时使用
DATABASE_URL="postgresql://postgres:密码@db.emfhfxayynshmgkxdccb.supabase.co:5432/postgres" \
npx tsx -e "
import { db, schema } from './src/server/db';
const result = await db.select().from(schema.topics).limit(10);
console.log(JSON.stringify(result, null, 2));
"
```
