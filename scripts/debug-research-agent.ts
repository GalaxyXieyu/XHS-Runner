/**
 * 调试 research_agent 的工具调用和 evidencePack 提取逻辑
 *
 * 用法: npx tsx scripts/debug-research-agent.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";

config({ path: resolve(process.cwd(), ".env.local") });

// 导入 research 相关模块
import { researchTools } from "../src/server/agents/tools";
import { getAgentPrompt } from "../src/server/services/promptManager";
import { createLLM } from "../src/server/agents/utils/configUtils";

// ========== 从 researchNode.ts 复制的解析函数 ==========
interface EvidencePack {
  items: Array<{ fact: string; source?: string; quote?: string }>;
  summary: string;
}

function parseEvidencePack(content: string): EvidencePack {
  const fallback: EvidencePack = {
    items: [],
    summary: "未提取到结构化研究证据",
  };

  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      const lines = content
        .split(/\n+/)
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 5);
      return {
        items: lines.map((fact) => ({ fact })),
        summary: lines.join("；") || fallback.summary,
      };
    }

    const parsed = JSON.parse(match[0]);
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item: any) => ({
            fact: String(item.fact || "").trim(),
            source: item.source ? String(item.source) : undefined,
            quote: item.quote ? String(item.quote) : undefined,
          }))
          .filter((item: any) => item.fact)
      : [];

    return {
      items,
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : fallback.summary,
    };
  } catch {
    return fallback;
  }
}

function extractEvidenceFromToolResults(messages: any[]): EvidencePack {
  const toolResults: Array<{ fact: string; source?: string }> = [];

  for (const msg of messages) {
    if (msg instanceof ToolMessage || msg.constructor?.name === "ToolMessage") {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (!content || content.length < 30) continue;

      // 尝试解析 JSON 格式的工具结果
      try {
        const parsed = JSON.parse(content);

        // webSearch 结果格式
        if (parsed.results && Array.isArray(parsed.results)) {
          for (const r of parsed.results.slice(0, 3)) {
            if (r.content || r.title) {
              toolResults.push({
                fact: (r.content || r.title || "").slice(0, 200),
                source: r.url || r.title,
              });
            }
          }
          if (parsed.answer && typeof parsed.answer === "string") {
            toolResults.push({ fact: parsed.answer.slice(0, 200), source: "webSearch" });
          }
          continue;
        }

        // searchNotes 结果格式
        if (parsed.notes && Array.isArray(parsed.notes)) {
          for (const n of parsed.notes.slice(0, 3)) {
            if (n.title || n.desc) {
              toolResults.push({
                fact: `${n.title || ""}: ${(n.desc || "").slice(0, 150)}`,
                source: n.url || n.author,
              });
            }
          }
          continue;
        }

        // 其他 JSON 格式
        if (parsed.summary) {
          toolResults.push({ fact: String(parsed.summary).slice(0, 200) });
        }
        if (parsed.analysis) {
          toolResults.push({ fact: String(parsed.analysis).slice(0, 200) });
        }
      } catch {
        // 非 JSON 格式，按行提取
        const lines = content
          .split(/\n+/)
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 30 && !line.startsWith("{") && !line.startsWith("["))
          .slice(0, 3);

        for (const line of lines) {
          toolResults.push({ fact: line.slice(0, 200) });
        }
      }
    }
  }

  if (toolResults.length === 0) {
    return { items: [], summary: "未提取到研究证据" };
  }

  // 去重
  const seen = new Set<string>();
  const uniqueResults = toolResults.filter((r) => {
    const key = r.fact.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    items: uniqueResults.slice(0, 8).map((r) => ({ fact: r.fact, source: r.source })),
    summary: `从搜索结果中提取了 ${Math.min(uniqueResults.length, 8)} 条信息`,
  };
}

// ========== 调试主函数 ==========
async function debugResearchAgent() {
  console.log("🔬 开始调试 research_agent\n");
  console.log("═".repeat(60));

  // 1. 初始化模型（使用项目封装的 createLLM）
  const model = await createLLM();
  const modelWithTools = model.bindTools(researchTools);
  const toolNode = new ToolNode(researchTools);

  // 2. 获取 prompt
  const systemPrompt = await getAgentPrompt("research_agent");
  console.log("📝 System Prompt (前200字):");
  console.log(systemPrompt?.slice(0, 200) + "...\n");

  // 3. 模拟用户需求
  const userRequirement = "帮我生成个 opencode cli 的快速上手教程";
  const briefHint = `【研究任务上下文】
用户需求：${userRequirement}
核心关键词：opencode cli, 安装, 命令, 教程

⚠️ 请务必使用上述关键词调用 searchNotes 和 webSearch 工具进行搜索。`;

  console.log("📋 Brief Hint:");
  console.log(briefHint);
  console.log("\n" + "─".repeat(60));

  // 4. 第一次调用 LLM
  console.log("\n🤖 第一次调用 LLM...");
  const response1 = await modelWithTools.invoke([
    new HumanMessage(systemPrompt || "你是研究专家"),
    new HumanMessage(briefHint),
  ]);

  const hasToolCalls1 = response1 instanceof AIMessage && response1.tool_calls?.length > 0;
  console.log("\n📊 LLM 返回:");
  console.log("  - hasToolCalls:", hasToolCalls1);
  console.log("  - toolCallsCount:", hasToolCalls1 ? (response1 as AIMessage).tool_calls?.length : 0);
  console.log("  - contentLength:", typeof response1.content === "string" ? response1.content.length : 0);

  if (hasToolCalls1) {
    const toolCalls = (response1 as AIMessage).tool_calls!;
    console.log("\n🔧 工具调用详情:");
    toolCalls.forEach((tc, i) => {
      console.log(`  [${i + 1}] ${tc.name}:`);
      console.log(`      args: ${JSON.stringify(tc.args).slice(0, 100)}...`);
    });
  }

  // 5. 测试 evidencePack 解析（第一次，应该为空）
  const content1 = typeof response1.content === "string" ? response1.content : "";
  let evidencePack1 = parseEvidencePack(content1);
  console.log("\n📦 第一次 evidencePack 解析:");
  console.log("  - items.length:", evidencePack1.items.length);
  console.log("  - summary:", evidencePack1.summary);

  if (!hasToolCalls1) {
    console.log("\n⚠️ LLM 没有返回工具调用，直接返回了内容");
    console.log("  content:", content1.slice(0, 300));
    return;
  }

  // 6. 执行工具调用
  console.log("\n" + "─".repeat(60));
  console.log("⚙️ 执行工具调用...\n");

  const toolResult = await toolNode.invoke({ messages: [response1] });
  const toolMessages = toolResult.messages as ToolMessage[];

  console.log(`📋 工具执行结果: ${toolMessages.length} 条 ToolMessage`);
  toolMessages.forEach((tm, i) => {
    const content = typeof tm.content === "string" ? tm.content : "";
    console.log(`\n  [${i + 1}] tool_call_id: ${(tm as any).tool_call_id}`);
    console.log(`      content (前200字): ${content.slice(0, 200)}...`);
  });

  // 7. 测试从工具结果提取 evidencePack
  console.log("\n" + "─".repeat(60));
  console.log("📦 从工具结果提取 evidencePack:");

  const fallbackPack = extractEvidenceFromToolResults(toolMessages);
  console.log("  - items.length:", fallbackPack.items.length);
  console.log("  - summary:", fallbackPack.summary);
  if (fallbackPack.items.length > 0) {
    console.log("  - items:");
    fallbackPack.items.forEach((item, i) => {
      console.log(`    [${i + 1}] ${item.fact.slice(0, 80)}...`);
    });
  }

  // 8. 第二次调用 LLM（带工具结果）
  console.log("\n" + "─".repeat(60));
  console.log("🤖 第二次调用 LLM（带工具结果）...");

  const allMessages = [
    new HumanMessage(systemPrompt || "你是研究专家"),
    new HumanMessage(briefHint),
    response1,
    ...toolMessages,
  ];

  const response2 = await modelWithTools.invoke(allMessages);

  const hasToolCalls2 = response2 instanceof AIMessage && response2.tool_calls?.length > 0;
  console.log("\n📊 LLM 返回:");
  console.log("  - hasToolCalls:", hasToolCalls2);
  console.log("  - toolCallsCount:", hasToolCalls2 ? (response2 as AIMessage).tool_calls?.length : 0);
  console.log("  - contentLength:", typeof response2.content === "string" ? response2.content.length : 0);

  const content2 = typeof response2.content === "string" ? response2.content : "";
  if (content2) {
    console.log("\n📝 LLM 返回内容 (前500字):");
    console.log(content2.slice(0, 500));
  }

  // 9. 测试 evidencePack 解析（第二次）
  let evidencePack2 = parseEvidencePack(content2);
  console.log("\n📦 第二次 evidencePack 解析:");
  console.log("  - items.length:", evidencePack2.items.length);
  console.log("  - summary:", evidencePack2.summary);

  // 10. 如果第二次解析失败，使用 fallback
  if (evidencePack2.items.length === 0 && fallbackPack.items.length > 0) {
    console.log("\n⚠️ LLM 没有输出有效 JSON，使用工具结果 fallback");
    evidencePack2 = fallbackPack;
  }

  // 11. 最终结果
  console.log("\n" + "═".repeat(60));
  console.log("✅ 最终 evidencePack:");
  console.log("  - items.length:", evidencePack2.items.length);
  console.log("  - summary:", evidencePack2.summary);
  console.log("  - evidenceComplete:", evidencePack2.items.length > 0);

  if (evidencePack2.items.length > 0) {
    console.log("\n📋 证据列表:");
    evidencePack2.items.forEach((item, i) => {
      console.log(`  [${i + 1}] ${item.fact}`);
      if (item.source) console.log(`      来源: ${item.source}`);
    });
  }
}

debugResearchAgent().catch((err) => {
  console.error("❌ 调试失败:", err);
  process.exit(1);
});
