/**
 * 测试 /api/agent/stream SSE 事件流
 * 验证 streamMode: ["updates", "tasks"] 的 agent_start / agent_end 时间差
 *
 * 用法: npx tsx scripts/test-stream.ts
 */

const API_URL = "http://localhost:3000/api/agent/stream";

const payload = {
  message: "写一篇关于 Vibe Coding 的小红书笔记，介绍什么是 Vibe Coding 以及它如何改变开发者的工作方式",
  themeId: 1,
  enableHITL: false,
  imageGenProvider: "jimeng",
};

interface TimingEntry {
  agent: string;
  startAt: number;
  endAt?: number;
  durationMs?: number;
}

async function main() {
  console.log("🚀 发送请求到", API_URL);
  console.log("📦 Payload:", JSON.stringify(payload, null, 2));
  console.log("─".repeat(60));

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    console.error("❌ 请求失败:", res.status, res.statusText);
    const text = await res.text();
    console.error(text);
    process.exit(1);
  }

  const timings = new Map<string, TimingEntry>();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventCount = 0;
  const globalStart = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 按行处理 SSE
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 最后一行可能不完整

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();

      if (raw === "[DONE]") {
        console.log("\n✅ [DONE] 流结束");
        continue;
      }

      let event: any;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }

      eventCount++;
      const elapsed = ((Date.now() - globalStart) / 1000).toFixed(1);
      const agent = event.agent || "";
      const type = event.type || "unknown";

      // 记录 agent 时间
      if (type === "agent_start" && agent) {
        timings.set(agent, { agent, startAt: Date.now() });
      }
      if (type === "agent_end" && agent) {
        const entry = timings.get(agent);
        if (entry) {
          entry.endAt = Date.now();
          entry.durationMs = entry.endAt - entry.startAt;
        }
      }

      // 打印事件摘要
      switch (type) {
        case "agent_start":
          console.log(`⏱️  +${elapsed}s  [${type}] ${agent} → "${event.content}"`);
          break;
        case "agent_end":
          const dur = timings.get(agent)?.durationMs;
          console.log(
            `✅  +${elapsed}s  [${type}] ${agent}${dur != null ? ` (${(dur / 1000).toFixed(1)}s)` : ""}`
          );
          break;
        case "tool_call":
          console.log(`🔧  +${elapsed}s  [${type}] ${agent} → ${event.tool}`);
          break;
        case "tool_result":
          const output = typeof event.toolOutput === "string"
            ? event.toolOutput.slice(0, 80)
            : JSON.stringify(event.toolOutput).slice(0, 80);
          console.log(`📋  +${elapsed}s  [${type}] ${agent}/${event.tool} → ${output}...`);
          break;
        case "message":
          console.log(
            `💬  +${elapsed}s  [${type}] ${agent} → "${(event.content || "").slice(0, 60)}..."`
          );
          break;
        case "supervisor_decision":
          console.log(`🔀  +${elapsed}s  [${type}] → ${event.decision} (${event.reason})`);
          break;
        case "brief_ready":
          console.log(`📝  +${elapsed}s  [${type}] Brief 已生成`);
          break;
        case "layout_spec_ready":
          console.log(`📐  +${elapsed}s  [${type}] 版式规划完成`);
          break;
        case "alignment_map_ready":
          console.log(`🔗  +${elapsed}s  [${type}] 段落映射完成`);
          break;
        case "quality_score":
          console.log(`⭐  +${elapsed}s  [${type}] ${event.content}`);
          break;
        case "content_update":
          console.log(`📄  +${elapsed}s  [${type}] title="${event.title?.slice(0, 30)}"`);
          break;
        case "image_progress":
          console.log(
            `🖼️  +${elapsed}s  [${type}] #${event.taskId} ${event.status} ${Math.round((event.progress || 0) * 100)}%`
          );
          break;
        case "workflow_complete":
          console.log(`🎉  +${elapsed}s  [${type}] 流程完成`);
          break;
        case "state_update":
          console.log(`📊  +${elapsed}s  [${type}] ${event.changes}`);
          break;
        default:
          console.log(`📨  +${elapsed}s  [${type}] ${agent} ${(event.content || "").slice(0, 50)}`);
      }
    }
  }

  // 打印时间统计
  console.log("\n" + "═".repeat(60));
  console.log("📊 Agent 执行时间统计:");
  console.log("─".repeat(60));
  const sorted = Array.from(timings.values()).sort(
    (a, b) => a.startAt - b.startAt
  );
  for (const entry of sorted) {
    const dur = entry.durationMs != null ? `${(entry.durationMs / 1000).toFixed(1)}s` : "未完成";
    const bar = entry.durationMs != null
      ? "█".repeat(Math.max(1, Math.round(entry.durationMs / 1000)))
      : "░░░";
    console.log(`  ${entry.agent.padEnd(30)} ${dur.padStart(8)}  ${bar}`);
  }
  console.log("─".repeat(60));
  console.log(`  总事件数: ${eventCount}`);
  console.log(`  总耗时: ${((Date.now() - globalStart) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("❌ 脚本错误:", err);
  process.exit(1);
});
