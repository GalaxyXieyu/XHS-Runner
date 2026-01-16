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

### 其他表
`accounts`, `competitors`, `publish_records`, `metrics`, `interaction_tasks`, `form_assist_records`, `trend_reports`, `creative_assets`, `rate_limit_state`

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
