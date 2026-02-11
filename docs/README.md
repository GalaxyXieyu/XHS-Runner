# 文档总览（V2）

> 目标：把“业务主流程、实现细节、运维操作”拆开，减少重复与冲突。
> 当前统一按 **单链路 Agent V2** 维护（不再以旧链路为主）。

## 目录导航

### 01-overview（先读）
- `docs/01-overview/README.md`：项目目标、系统边界、阅读顺序

### 02-architecture（架构）
- `docs/02-architecture/single-flow-v2.md`：LangGraph 单链路架构与节点职责

### 03-agent-flow（流程与调试）
- `docs/03-agent-flow/runtime-lifecycle.md`：一次请求从 `/api/agent/stream` 到 `[DONE]` 的生命周期
- `docs/03-agent-flow/clarification-and-hitl.md`：统一澄清机制与 HITL 中断/恢复约定
- `docs/03-agent-flow/debug-playbook.md`：提示词与路由调试手册（含评估脚本）

### 04-reference（高频查阅）
- `docs/04-reference/agent-api.md`：Agent API（`stream` / `confirm`）
- `docs/04-reference/sse-events.md`：SSE 事件清单
- `docs/04-reference/state-fields.md`：`AgentState` 关键字段索引

### 05-ops（运行与发布）
- `docs/05-ops/commands-and-checks.md`：开发/构建/验证命令清单
- `docs/deployment/DEPLOYMENT.md`：生产部署步骤
- `docs/deployment/CI-CD.md`：CI/CD 配置说明

## 历史文档

历史设计记录与旧结构文档保留在原目录（如 `docs/agent/`、`docs/reference/`），
新内容优先写入上述 01~05 目录。历史内容索引见：
- `docs/99-archive/README.md`
