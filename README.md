# XHS Runner

小红书内容分析与运营桌面应用（Electron + Next.js），覆盖主题/关键词管理、采集、洞察、内容生成与运营排期。

## 当前能力

- **主题管理**：主题/关键词/竞品管理
- **抓取采集**：按关键词抓取笔记与互动数据；支持 local/mock 驱动
- **数据洞察**：指标汇总、趋势分析、竞品对比、导出 CSV
- **内容创作**：LLM 流式分析/生成、Prompt Profile、创作包管理
- **运营中心**：发布任务、互动任务、执行历史与队列
- **调度系统**：Cron 任务、限流与失败重试
- **系统设置**：采集频率、LLM/外部服务配置、运行参数

## 开发中 / 计划

- 视频笔记过滤
- 词云可视化
- 历史趋势图表
- 内容生成调试与验证
  - 生成链路可观测性：Prompt 预览、模型/参数、token/耗时、失败原因归因
  - 可重放：同一输入一键复跑 + 版本对比
  - 最小 API 测试：/api/generate、/api/insights/analyze、/api/agent/stream 的基础烟测（先无 DB 场景可跑）
- 发布跟踪与指标体系
  - 基础指标：views/likes/comments/saves/follows
  - 派生指标：互动率、收藏率、评论率、关注转化率、峰值时间、增长斜率
  - 数据采集节奏：发布后 1h/6h/24h/48h/7d 的快照
  - 展示与过滤：按主题/关键词/内容类型/发布时间的对比
- AI 创作建议
  - 输入：高分样本（标题/标签/发布时间/封面/内容结构）+ 指标
  - 输出：标题/标签/发布时间/结构建议 + 可执行模板
  - 运营闭环：建议 → 生成 → 发布 → 回传指标 → 更新建议
- 自动化测试与发布流水线

## 架构概览

- **Electron 主进程**：`electron/main.js`（IPC 路由、窗口生命周期）
- **Preload**：`electron/preload.js`（暴露 IPC API）
- **Renderer UI**：`src/pages/` + `src/components/`
- **服务层（TS）**：`src/server/services/xhs/`
- **Next API**：`src/pages/api/`（桥接服务层）
- **编译产物**：`electron/server/`（由 `npm run build:server` 生成）

## 数据与配置

- **数据库**：Drizzle + Postgres（Supabase），需配置 `DATABASE_URL` / `POSTGRES_URL` / `SUPABASE_DB_URL`
- **Supabase 客户端**：`src/server/supabase.ts`（遗留兼容）
- **运行时配置**：`XHS_MCP_DRIVER=local|mock`（默认 local）、`XHS_MCP_XSEC_TOKEN`、`XHS_BROWSER_PATH`
- **本地数据路径**：`XHS_USER_DATA_PATH`（默认 Electron userData）

## 本地开发

- `npm run dev`：启动 Next.js 并拉起 Electron
- `npm run dev:next`：仅启动 Renderer
- `npm run dev:electron`：仅启动 Electron（需 `http://localhost:3000` 就绪）
- `npm run build:server`：编译服务层到 `electron/server/`
- `npm run smoke:xhs` / `npm run smoke:xhs-capture`：登录/抓取冒烟

## 参考文档

- `SETUP.md`
- `docs/Config.md`
- `docs/Settings.md`
- `docs/Workflow.md`
- `docs/Analytics.md`
- `docs/IPC.md`
- `docs/Packaging.md`
- `docs/mcp/LocalModeSmoke.md`

---

## Agent 系统架构

### 核心组件

```
                    ┌──────────────────────────────────────────────────────────────┐
                    │                         迭代循环                              │
                    │                                                              │
                    ▼                                                              │
          ┌─────────────────┐                                                      │
          │   supervisor    │◄─────────────────────────────────────────────────────┤
          │   (状态协调)     │                                                      │
          └────────┬────────┘                                                      │
                   │ 路由决策                                                       │
     ┌─────────────┼─────────────┬─────────────┬─────────────┐                     │
     ▼             ▼             ▼             ▼             ▼                     │
┌─────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐ ┌─────────┐                    │
│  style  │ │ research │ │ writer  │ │  image    │ │  image  │                    │
│ analyzer│ │  agent   │ │  agent  │ │  planner  │ │  agent  │                    │
└────┬────┘ └────┬─────┘ └────┬────┘ └─────┬─────┘ └────┬────┘                    │
     │           │            │            │            │                          │
     │ Gemini    │ Tools      │            │            │                          │
     │ Vision    │ 调用       │            │            │                          │
     │           │            │            │            │                          │
     └───────────┴────────────┴────────────┴────────────┘                          │
                              │                                                    │
                              ▼                                                    │
                    ┌─────────────────┐                                            │
                    │  review_agent   │                                            │
                    │  (多模态审核)    │                                            │
                    └────────┬────────┘                                            │
                             │                                                     │
            ┌────────────────┼────────────────┐                                    │
            ▼                ▼                ▼                                    │
       ✅ 通过          ⚠️ 重新规划       ⚠️ 重新生成                               │
            │                │                │                                    │
            ▼                └────────────────┴────────────────────────────────────┘
         [END]                        (最多 3 次迭代)
```


### Agent 状态机 (AgentState)

```typescript
const AgentState = Annotation.Root({
  messages: BaseMessage[],           // 对话消息历史
  currentAgent: AgentType,           // 当前执行 Agent
  researchComplete: boolean,         // 研究是否完成
  contentComplete: boolean,          // 内容创作是否完成
  referenceImageUrl: string | null,  // 参考图 URL
  referenceImages: string[],         // 多参考图数组
  styleAnalysis: StyleAnalysis,      // 风格分析结果
  imagePlans: ImagePlan[],           // 图片规划列表
  creativeId: number,                // 创意 ID
  reviewFeedback: ReviewFeedback,    // 审核反馈
  imagesComplete: boolean,           // 图片生成是否完成
  iterationCount: number,            // 迭代次数
  maxIterations: number,             // 最大迭代次数 (默认3)
});
```

### 路由决策逻辑

`routeFromSupervisor` 函数按以下优先级路由：

1. 有参考图 && 未分析风格 → **style_analyzer_agent**
2. 未完成研究 → **research_agent**
3. 未创作内容 → **writer_agent**
4. 无图片规划 → **image_planner_agent**
5. 未完成图片生成 → **image_agent**
6. 未审核 → **review_agent**
7. 审核未通过 && 未达迭代上限 → 重新调用对应 Agent
8. 审核通过或达到迭代上限 → **END**

### 工具集 (Research Tools)

| 工具 | 功能 | 数据来源 |
|-----|------|---------|
| `searchNotes` | 搜索小红书笔记 | 内部采集服务 |
| `analyzeTopTags` | 分析热门标签 | insightService |
| `getTrendReport` | 获取趋势报告 | analytics 模块 |
| `getTopTitles` | 获取爆款标题 | 数据库查询 |

### 图片生成架构

```
generateImage (统一接口)
          │
          ├─── Gemini ───→ geminiClient.ts (原生 API)
          │                   ├── analyzeReferenceImage()  // 风格分析
          │                   └── generateImageWithReference()
          │
          └─── 即梦 (Jimeng) ──→ imageProvider.ts
                                  └── generateJimengImage()
                                      └── Volcengine 签名
```

### 关键特性

| 特性 | 说明 |
|-----|------|
| **迭代优化** | 最多迭代 3 次，审核不通过时自动重试 |
| **参考图风格迁移** | 上传参考图，Agent 学习视觉风格后生成配图 |
| **多模态审核** | review_agent 使用 Vision 模型检查图文相关性 |
| **SSE 实时流式** | 前端实时看到 Agent 执行进度 |
| **Langfuse 追踪** | 支持完整的 Trace 和 Span 记录 |

### 相关文件

| 文件 | 用途 |
|-----|------|
| `src/server/agents/multiAgentSystem.ts` | 核心多 Agent 系统 |
| `src/server/agents/xhsContentAgent.ts` | 简化版单 Agent 实现 |
| `src/server/agents/tools/index.ts` | Agent 工具集 |
| `src/pages/api/agent/stream.ts` | SSE 流式 API |
| `src/server/db/seeds/agentPrompts.ts` | Prompt 种子数据 |
