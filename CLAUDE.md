# XHS-Runner 项目状态

## 已完成功能

### 核心功能
- [x] Electron + Next.js 桌面应用架构
- [x] 小红书登录（扫码/Cookie）
- [x] 多主题管理（创建/编辑/删除）
- [x] 多关键词抓取（每主题支持多个关键词）
- [x] 笔记抓取与存储（SQLite）

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
- Backend: Next.js API Routes + SQLite (better-sqlite3)
- Desktop: Electron
- LLM: 可配置（支持 OpenAI 兼容 API）

## 数据库表

- `themes` - 主题管理
- `topics` - 抓取的笔记
- `trend_reports` - 趋势报告历史
- `settings` - 应用配置
