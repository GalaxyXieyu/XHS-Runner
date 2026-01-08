# 产品需求文档 (PRD) - 小红书自动化运营系统 (XHS Automation System)

## 1. 产品概述
本系统旨在构建一个全流程的小红书账号运营辅助工具。通过**“主题驱动 (Theme-Driven)”**的工作流，结合 MCP (Model Context Protocol) 强大的自动化能力，帮助用户从零开始完成**数据收集、深度分析、内容生产、账号管理**的完整闭环。

## 2. 核心用户旅程 (User Journey)

系统围绕“主题 (Theme)”这一核心概念展开，用户的使用流程是线性的、流畅的：

1.  **定义主题 (Define)**: 用户创建一个新的运营主题（例如“2024夏季防晒攻略”），确立目标。
2.  **获取数据 (Acquire)**:
    *   **关键词搜索**: 系统通过 MCP 搜索海量笔记。
    *   **竞品追踪**: 系统定期监控指定竞品账号的最新发布。
3.  **分析洞察 (Analyze)**:
    *   **深度透视**: 分析爆款笔记的评论区痛点、标题公式、封面特征。
    *   **标签/关键词效能**: 识别流量密码。
4.  **生产内容 (Produce)**:
    *   **爆款模仿**: 基于分析结果，AI 生成文案和视觉脚本。
    *   **参数校验**: 自动检查发布合规性。
5.  **发布与运营 (Operate)**:
    *   **一键发布**: 调用 MCP 自动上传图文/视频。
    *   **互动管理**: 自动回复评论，抢首评。
    *   **优胜劣汰**: 监控数据，自动清理低质内容。

## 3. 系统架构图 (System Architecture)

```mermaid
graph TD
    User[用户] -->|1. 创建/进入| ThemeWorkspace[主题工作台]
    
    subgraph ThemeWorkspace [主题工作台 (Theme Workspace)]
        direction TB
        
        %% Step 1: 获取与分析
        subgraph Step1 [Step 1: 洞察 (Discovery)]
            Config[配置: 关键词/竞品] -->|MCP: xhs_search_note| Crawler[抓取引擎]
            Config -->|MCP: xhs_get_user_notes| CompetitorMonitor[竞品监控]
            
            Crawler & CompetitorMonitor -->|MCP: xhs_get_note_detail| NotePool[笔记池]
            
            NotePool -->|提取评论| CommentAnalysis[评论区情绪/痛点分析]
            NotePool -->|AI聚合| SmartInsights[智能洞察引擎]
            
            SmartInsights & CommentAnalysis -->|输出| Report[深度分析报告]
        end
        
        %% Step 2: 生产
        subgraph Step2 [Step 2: 创作 (Creation)]
            Report -->|指导| Generator[生成引擎]
            Generator -->|MCP: xhs_get_note_detail| CoverDownloader[素材获取]
            Generator -->|LLM + Diffusion| Drafts[创意草稿]
        end
        
        Step1 --> Step2
    end
    
    %% Step 3: 发布与反馈
    subgraph AccountSystem [Step 3: 运营 (Operations)]
        Drafts -->|MCP: xhs_publish_content| Publisher[发布器]
        Publisher --> XHS[小红书平台]
        
        XHS -.->|MCP: xhs_comment_on_note| AutoReply[自动互动/抢首评]
        XHS -.->|MCP: xhs_delete_note| Cleanup[低质清理]
        XHS -.->|MCP: xhs_get_user_notes| Monitor[效果监控]
        
        Monitor -.->|优化建议| ThemeWorkspace
    end
```

## 4. 功能模块详情与 MCP 映射

### 4.1 数据收集与深度分析 (Data Collection & Deep Analytics)
核心目标：不仅是“收集数据”，更是“发现规律”和“监听用户”。

*   **基础抓取**:
    *   **关键词搜索**:
        *   *实现*: `xhs_search_note(keyword, sort, limit)`
        *   *功能*: 按热度抓取 Top 50 笔记，提取元数据。
    *   **竞品监控 (Competitor Tracking)** - *NEW*:
        *   *实现*: `xhs_get_user_notes(user_id)`
        *   *功能*: 每日监控竞品账号，发现其最新爆款。
*   **深度透视**:
        *   **标签挖掘 (Tag Mining)** - *NEW*:
            *   *实现*: 本地正则提取 `desc` 中的 `#tag` + 统计频率。
            *   *功能*: 统计 Top 50 笔记的高频标签，生成词云，发现流量密码。
        *   **标题模式分析 (Title Pattern Analysis)** - *NEW*:
            *   *实现*: NLP 分词统计 Top 50 标题的高频词汇和句式。
            *   *功能*: 总结爆款标题公式（例如：“3秒教会你...”、“千万别...”）。
        *   **评论区痛点分析 (Comment Sentiment)** - *NEW*:
            *   *实现*: `xhs_get_note_detail(note_id)` -> 提取 `comments` 字段。
            *   *功能*: AI 分析评论区，提取用户“避雷点”、“强需求”和“高频提问”，作为选题依据。
        *   **多模态素材获取**:
            *   *实现*: `xhs_get_note_detail(note_id)` -> 获取高清无水印图片/视频链接。
            *   *功能*: 供多模态模型分析封面构图、配色。

### 4.2 内容生成板块 (Content Generation)
核心目标：基于灵感和分析结论，利用 AI 高效生产。

*   **输入配置**:
    *   **智能引用**: 自动引用“智能洞察”中的爆款特征（如：自动应用热门标签、模仿热门封面色调）。
    *   **AI 表单助手 (Form Assist)** - *NEW*:
        *   *实现*: 基于洞察报告 + 参考笔记 + 用户历史偏好，自动填充发布表单（标题/正文/标签/分类/封面风格/定时发布）。
        *   *功能*: 生成可编辑的“建议草稿”，用户一键采纳或手动调整，并记录调整反馈用于后续优化。
    *   **合规校验**:
        *   *实现*: 在生成阶段预校验标题长度、Tag 数量（参考 MCP 限制：标题<=20字，图片<=18张）。
*   **生成流程**:
    *   **文案**: 结合评论区痛点生成直击人心的标题。
    *   **视觉**: 生成符合爆款规律的图片/脚本。

### 4.3 账号运营与管理 (Account Operations)
核心目标：自动化执行发布与互动，维持账号活跃度。

*   **发布执行**:
    *   **一键发布**:
        *   *实现*: `xhs_publish_content(type, title, content, files, tags)`
        *   *功能*: 支持图文（URL自动下载）和视频发布。
*   **社区互动 (Community Mgmt)** - *NEW*:
    *   **自动回评/抢首评**:
        *   *实现*: `xhs_comment_on_note(note_id, content)`
        *   *功能*: 发布后自动发一条引导评论；监测到新评论自动回复（需结合 LLM 生成回复内容）。
*   **数据监控与优胜劣汰**:
    *   **效果监控**:
        *   *实现*: `xhs_get_user_notes` + `xhs_get_note_detail`
        *   *功能*: 追踪自己笔记的阅读/互动数据。
    *   **低质清理**:
        *   *实现*: `xhs_delete_note(note_id)`
        *   *功能*: 发布 24h 后若数据低于阈值，自动隐藏/删除。

## 5. 页面设计 (UI/UX)

### 5.1 首页：主题管理 (Theme Manager)
*   新建主题向导，主题列表卡片。

### 5.2 主题工作台 (Theme Workspace)

#### Tab 1: 洞察与灵感 (Insight & Inspiration)
*   **深度分析看板**:
    *   **热词/标签云 (Tag Cloud)**: 可视化展示当前主题下的高频 Tag 和标题热词。
    *   **用户心声 (评论分析)**: 展示“用户最讨厌...” “用户最想看...”。
    *   **竞品动态**: 展示关注的竞品账号今日更新。
*   **笔记瀑布流**: 包含关键词搜索结果和竞品最新笔记。

#### Tab 2: 创作实验室 (Creative Lab)
*   **输入区**: 引用参考笔记，配置模型；支持“AI 自动填表”生成发布表单草稿。
*   **生成结果区**: 文案/图片/脚本预览与编辑。

#### Tab 3: 运营中心 (Operations Center) - *Renamed*
*   **发布队列**: 待发布任务管理。
*   **互动助手**:
    *   展示未读评论，提供 AI 回复建议。
    *   配置自动抢首评话术。
*   **数据报表**: 账号及单篇笔记数据趋势。

### 5.3 全局设置 (Global Settings)
*   账号授权 (扫码登录)、API Key、系统参数。

---

## 6. 数据结构设计 (Data Schema)

### 6.1 主题与关键词
*   **themes** (表)
    *   `id`, `name`, `status`, `created_at`
    *   `analytics_json`: TEXT (*NEW* - 缓存该主题的深度分析结果: top_tags, cover_patterns, title_keywords)
*   **keywords** (表)
*   **competitors** (表 - *NEW*)
    *   `id`, `theme_id`, `xhs_user_id`, `name`, `last_monitored_at`

### 6.2 抓取内容与分析
*   **topics** (表)
*   **comments** (表 - *NEW*)
    *   `id`, `topic_id`, `content`, `likes`, `sentiment` (情感分析结果)
*   **topic_growth_data** (表)

### 6.3 创意与生成
*   **creatives** (表)
*   **creative_assets** (表)
*   **form_assist_records** (表 - *NEW*)
    *   `id`, `theme_id`, `creative_id`, `source`, `suggestion_json`, `user_edit_json`, `accepted`, `created_at`

### 6.4 账号与发布
*   **accounts** (表)
*   **publish_records** (表)
*   **interaction_tasks** (表 - *NEW*)
    *   `id`, `publish_record_id`, `type` ('auto_reply', 'first_comment'), `status`, `content`
