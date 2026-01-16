/**
 * Agent Stream API 测试脚本
 *
 * 用法:
 *   npx tsx scripts/test-agent-stream.ts
 *   npx tsx scripts/test-agent-stream.ts --theme-id 1
 *   npx tsx scripts/test-agent-stream.ts --message "写一篇护肤笔记"
 *   npx tsx scripts/test-agent-stream.ts --reference-image ./scripts/references/xxx.jpg
 *
 * 环境变量:
 *   API_URL - API 地址 (默认 http://localhost:3000)
 *
 * 图片保存位置:
 *   - Electron: ~/Library/Application Support/xhs-generator/assets/
 *   - Next.js:  ./.xhs-data/assets/
 */

import path from "path";
import fs from "fs";

const API_URL = process.env.API_URL || "http://localhost:3000";

interface AgentEvent {
  type: "agent_start" | "agent_end" | "tool_call" | "tool_result" | "message";
  agent?: string;
  tool?: string;
  content: string;
  timestamp: number;
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  let themeId: number | undefined;
  let message = "帮我创作一篇关于如何用Cursor快速写代码的小红书笔记";
  // 默认使用参考图
  let referenceImage: string | undefined = "./scripts/references/如何让AI「抄」参考图？【附指令词】_1_珍珠奶茶_来自小红书网页版.jpg";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--theme-id" && args[i + 1]) {
      themeId = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--message" && args[i + 1]) {
      message = args[i + 1];
      i++;
    } else if (args[i] === "--reference-image" && args[i + 1]) {
      referenceImage = args[i + 1];
      i++;
    }
  }
  return { themeId, message, referenceImage };
}

// 读取图片并转换为 base64
function readImageAsBase64(imagePath: string): string {
  const absolutePath = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`参考图不存在: ${absolutePath}`);
  }
  const buffer = fs.readFileSync(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

// 获取资源保存路径
function getAssetsPath(): string {
  const envPath = process.env.XHS_USER_DATA_PATH;
  if (envPath) return path.join(envPath, "assets");
  return path.join(process.cwd(), ".xhs-data", "assets");
}

async function testAgentStream() {
  const { themeId, message, referenceImage } = parseArgs();
  const assetsPath = getAssetsPath();
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("🚀 Agent Stream API 测试");
  console.log("═".repeat(60));
  console.log(`📍 API:      ${API_URL}/api/agent/stream`);
  console.log(`📁 资源目录: ${assetsPath}`);
  console.log(`📝 消息:     "${message}"`);
  console.log(`🏷️  主题ID:   ${themeId ?? "无"}`);
  console.log(`🖼️  参考图:   ${referenceImage ?? "无"}`);
  console.log("─".repeat(60));

  // 检查资源目录
  if (fs.existsSync(assetsPath)) {
    const files = fs.readdirSync(assetsPath);
    console.log(`📂 现有资源: ${files.length} 个文件`);
  } else {
    console.log(`📂 资源目录不存在，将在生成时创建`);
  }
  console.log("─".repeat(60));

  // 准备参考图
  let referenceImageBase64: string | undefined;
  if (referenceImage) {
    try {
      referenceImageBase64 = readImageAsBase64(referenceImage);
      console.log(`✅ 参考图已加载 (${Math.round(referenceImageBase64.length / 1024)}KB)`);
    } catch (error: any) {
      console.error(`❌ 参考图加载失败: ${error.message}`);
      process.exit(1);
    }
  }

  const events: AgentEvent[] = [];
  const toolCalls: { tool: string; agent: string; time: string }[] = [];

  try {
    const requestBody: any = { message, themeId };
    if (referenceImageBase64) {
      requestBody.referenceImageUrl = referenceImageBase64;
    }

    const response = await fetch(`${API_URL}/api/agent/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    console.log("\n📡 开始接收事件流...\n");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          printSummary(events, toolCalls, startTime, assetsPath);
          return;
        }

        try {
          const event: AgentEvent = JSON.parse(data);
          events.push(event);
          printEvent(event, toolCalls);
        } catch (e) {
          console.log(`⚠️  解析失败: ${data.slice(0, 100)}`);
        }
      }
    }
  } catch (error: any) {
    console.error("\n" + "═".repeat(60));
    console.error("❌ 测试失败");
    console.error("═".repeat(60));
    console.error(`错误: ${error.message}`);
    if (error.cause) console.error(`原因: ${error.cause}`);
    process.exit(1);
  }
}

function printEvent(event: AgentEvent, toolCalls: typeof Array.prototype) {
  const time = new Date(event.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const prefix = `[${time}]`;

  switch (event.type) {
    case "agent_start":
      console.log(`\n${prefix} 🤖 ─── ${event.agent} 开始 ───`);
      break;

    case "agent_end":
      console.log(`${prefix} ✅ ${event.agent} 完成`);
      break;

    case "tool_call":
      console.log(`${prefix} 🔧 调用工具: ${event.tool}`);
      toolCalls.push({ tool: event.tool!, agent: event.agent!, time });
      break;

    case "tool_result":
      console.log(`${prefix} 📊 工具返回: ${event.tool}`);
      // 尝试解析并显示关键信息
      try {
        if (event.content.includes("{")) {
          const match = event.content.match(/\{[\s\S]*\}/);
          if (match) {
            const json = JSON.parse(match[0]);
            if (json.count !== undefined) console.log(`     └─ 找到 ${json.count} 条结果`);
            if (json.topTags) console.log(`     └─ 热门标签: ${json.topTags.slice(0, 5).map((t: any) => t.tag).join(", ")}`);
            if (json.titles) console.log(`     └─ 爆款标题: ${json.titles.length} 条`);
            if (json.taskId) console.log(`     └─ 图片任务ID: ${json.taskId}`);
          }
        }
      } catch {
        // 忽略解析错误
      }
      break;

    case "message":
      console.log(`${prefix} 💬 ${event.agent || "系统"}:`);
      // 分段显示长消息
      const content = event.content;
      if (content.length > 800) {
        console.log(content.slice(0, 800));
        console.log(`     ... (共 ${content.length} 字符)`);
      } else {
        console.log(content);
      }
      break;
  }
}

function printSummary(
  events: AgentEvent[],
  toolCalls: { tool: string; agent: string; time: string }[],
  startTime: number,
  assetsPath: string
) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "═".repeat(60));
  console.log("📊 执行摘要");
  console.log("═".repeat(60));
  console.log(`⏱️  总耗时: ${duration}s`);
  console.log(`📨 事件数: ${events.length}`);
  console.log(`🔧 工具调用: ${toolCalls.length} 次`);

  if (toolCalls.length > 0) {
    console.log("\n工具调用详情:");
    const toolStats: Record<string, number> = {};
    toolCalls.forEach((tc) => {
      toolStats[tc.tool] = (toolStats[tc.tool] || 0) + 1;
    });
    Object.entries(toolStats).forEach(([tool, count]) => {
      console.log(`  - ${tool}: ${count} 次`);
    });
  }

  // 检查是否有图片生成
  const imageEvents = events.filter(
    (e) => e.type === "tool_call" && e.tool === "generate_image"
  );
  if (imageEvents.length > 0) {
    console.log(`\n🖼️  图片生成任务: ${imageEvents.length} 个`);
    console.log(`   保存位置: ${assetsPath}`);

    // 检查新生成的文件
    if (fs.existsSync(assetsPath)) {
      const files = fs.readdirSync(assetsPath).filter((f) => f.endsWith(".png"));
      const recentFiles = files
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(assetsPath, f)).mtime }))
        .filter((f) => Date.now() - f.mtime.getTime() < 60000)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (recentFiles.length > 0) {
        console.log(`   最近生成:`);
        recentFiles.slice(0, 3).forEach((f) => {
          console.log(`     - ${f.name}`);
        });
      }
    }
  }

  // 提取最终内容
  const messageEvents = events.filter((e) => e.type === "message" && e.agent === "writer_agent");
  if (messageEvents.length > 0) {
    const lastContent = messageEvents[messageEvents.length - 1].content;
    console.log("\n" + "─".repeat(60));
    console.log("📝 生成内容预览:");
    console.log("─".repeat(60));

    // 提取标题
    const titleMatch = lastContent.match(/📌\s*标题[：:]\s*(.+)/);
    if (titleMatch) console.log(`标题: ${titleMatch[1]}`);

    // 提取标签
    const tagMatch = lastContent.match(/🏷️\s*标签[：:]\s*(.+)/);
    if (tagMatch) console.log(`标签: ${tagMatch[1].slice(0, 100)}`);
  }

  console.log("\n" + "═".repeat(60));
  console.log("✅ 测试完成");
  console.log("═".repeat(60));
}

testAgentStream();
