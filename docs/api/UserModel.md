# 用户体系模型与落库方案

## 目标
补齐用户体系（账号/权限/会话/授权方式），并与主题/内容/发布链路建立关联，支持多账号、多角色与安全隔离。

## 核心实体

### users（新增）
- 字段建议：id、username、display_name、email、phone、status、created_at、updated_at
- 说明：作为系统内部用户，负责权限与数据隔离的主体。

### roles（新增）
- 字段建议：id、name、description
- 说明：权限集合（如 admin/editor/viewer），便于管理权限矩阵。

### user_roles（新增）
- 字段建议：user_id、role_id、created_at
- 说明：多对多关联，支持用户多角色。

### sessions（新增）
- 字段建议：id、user_id、token、expires_at、auth_type、created_at、last_seen_at
- auth_type：enum=[qr,cookie,manual]
- 说明：统一会话管理，后续 IPC/HTTP 鉴权共用。

### accounts（已有）
- 作用：绑定小红书平台账号，用于发布/互动。
- 关系：users 1..n accounts（一个用户可管理多个平台账号）。

## 关联关系（与现有业务）
- themes：新增 owner_user_id 或 created_by 字段，支持用户维度隔离。
- creatives / publish_records / interaction_tasks：新增 owner_user_id 或 account_id 外键，确保审计与权限控制。
- settings：新增 user_id 维度配置，支持多用户独立配置。

## 鉴权与授权设计
- 鉴权：使用 sessions.token，统一用于 IPC 与未来 HTTP 接口。
- 授权：通过 role + permission 进行功能域限制（如主题管理、发布、互动、配置）。
- 数据隔离：按 user_id 过滤主题、创意、发布记录与互动任务。

## 迁移策略（设计建议）
1. 新增 users/roles/user_roles/sessions 表。
2. 对 themes/creatives/publish_records 增加 owner_user_id（可先允许 null，逐步回填）。
3. 将当前默认账号绑定到系统内置用户（admin）。

## 与前端能力对应
- 系统设置：账号授权、会话状态、API Key 配置需要绑定 user_id。
- 主题管理：主题创建/修改需要记录 owner_user_id。
- 运营中心：发布、评论、自动回复需关联 account_id 与 user_id。

## 参考
- `data/schema.md:114`
- `electron/db.js:6`
- `components/Settings.tsx:1`
