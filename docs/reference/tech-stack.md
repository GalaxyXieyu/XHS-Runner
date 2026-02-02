# 技术选型表（参考）

| 层级 | 技术选型 |
|-----|---------|
| Agent 框架 | LangGraph + LangChain |
| LLM | OpenAI 兼容 API (可配置 Base URL + API Key) |
| 状态持久化 | PostgresSaver (Postgres) |
| 链路追踪 | Langfuse |
| 通信协议 | SSE (Server-Sent Events) |
| 图片生成 | 火山引擎即梦 (Jimeng) + Gemini Vision |
