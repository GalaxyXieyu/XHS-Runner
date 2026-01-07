# 后端接口清单（Draft）

## 约定
- 传输层：当前 IPC，后续可映射为 HTTP（资源 + 动作）。
- 响应结构：`{ ok: boolean, data?: any, error?: { code, message, detail? } }`。
- 错误码建议：
  - E_AUTH_REQUIRED / E_FORBIDDEN / E_NOT_FOUND / E_VALIDATION
  - E_MCP_FAILURE / E_DB_FAILURE / E_TIMEOUT

## 资源域接口

### Auth / Session
- auth:login
- auth:logout
- auth:session

### Users
- users:list
- users:get
- users:create
- users:update
- users:disable

### Themes
- themes:list
- themes:create
- themes:update
- themes:remove
- themes:setStatus

### Keywords
- keywords:list
- keywords:create
- keywords:update
- keywords:remove

### Competitors
- competitors:list
- competitors:add
- competitors:remove
- competitors:notes

### Topics / Notes
- topics:list
- topics:detail
- topics:refresh
- topics:comments
- topics:growth

### Insights
- insights:get
- insights:refresh

### Creatives / Assets
- creatives:list
- creatives:create
- creatives:update
- creatives:remove
- creativeAssets:list
- creativeAssets:add
- creativeAssets:remove

### Publish
- publish:list
- publish:enqueue
- publish:cancel
- publish:status

### Interactions
- interactions:list
- interactions:enqueue
- interactions:reply
- interactions:toggleAutoReply

### Accounts
- accounts:list
- accounts:create
- accounts:update
- accounts:status
- accounts:qr
- accounts:refreshQr

### Settings / Config
- settings:get
- settings:set
- config:get
- config:set

### Metrics / Workflow
- metrics:record
- metrics:summary
- metrics:export
- workflow:publishTopic
- workflow:rollback

### FormAssist
- formAssist:list
- formAssist:generate
- formAssist:apply
- formAssist:feedback

## 参考
- `electron/main.js:42`
- `docs/IPC.md:1`
