/**
 * 大白话讲 Transformer - 图文笔记生成测试
 *
 * 主题：科普教学类内容，用通俗易懂的方式讲解 Transformer 架构
 *
 * 用法:
 *   npx tsx scripts/test-transformer.ts
 *   npx tsx scripts/test-transformer.ts --provider jimeng
 *   npx tsx scripts/test-transformer.ts --multi-ref  # 多参考图模式
 *
 * 环境变量:
 *   API_URL - API 地址 (默认 http://localhost:3000)
 */

import path from "path";
import fs from "fs";

const API_URL = process.env.API_URL || "http://localhost:3000";

// Transformer 科普主题
const TRANSFORMER_TOPIC = "用大白话讲 Transformer";

// 参考图配置 - 自动加载目录下所有图片
const REFERENCES_DIR = "./scripts/references";
function getReferenceImages(): string[] {
  const refsDir = path.isAbsolute(REFERENCES_DIR) ? REFERENCES_DIR : path.join(process.cwd(), REFERENCES_DIR);
  if (!fs.existsSync(refsDir)) {
    console.warn(`⚠️  参考图目录不存在: ${refsDir}`);
    return [];
  }
  const files = fs.readdirSync(refsDir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
  return files.map((f) => path.join(REFERENCES_DIR, f));
}

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
  let imageGenProvider: "gemini" | "jimeng" = "jimeng"; // Jimeng 生成的图片更清晰
  let useMultiRef = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      imageGenProvider = args[i + 1] as "gemini" | "jimeng";
      i++;
    } else if (args[i] === "--multi-ref") {
      useMultiRef = true;
    }
  }
  return { imageGenProvider, useMultiRef };
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

async function testTransformerNote() {
  const { imageGenProvider, useMultiRef } = parseArgs();
  const assetsPath = getAssetsPath();
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("🚀 大白话讲 Transformer - 图文笔记生成测试");
  console.log("═".repeat(60));
  console.log(`📍 API:      ${API_URL}/api/agent/stream`);
  console.log(`📁 资源目录: ${assetsPath}`);
  console.log(`🎨 生图模型: ${imageGenProvider}`);
  console.log(`🖼️  多参考图: ${useMultiRef ? "是" : "否"}`);
  console.log("─".repeat(60));

  // 准备参考图 - 自动加载目录下所有图片
  const referenceImagePaths = getReferenceImages();
  let referenceImagesBase64: string[] = [];

  console.log(`📂 参考图目录: ${REFERENCES_DIR}`);
  console.log(`   找到 ${referenceImagePaths.length} 张参考图\n`);

  for (const refImage of referenceImagePaths) {
    try {
      const base64 = readImageAsBase64(refImage);
      referenceImagesBase64.push(base64);
      console.log(`✅ ${path.basename(refImage)} (${Math.round(base64.length / 1024)}KB)`);
    } catch (error: any) {
      console.warn(`❌ ${path.basename(refImage)} 加载失败`);
    }
  }

  if (referenceImagesBase64.length === 0) {
    console.log("\n⚠️  没有加载到参考图，将使用纯文本生成");
  } else {
    console.log(`\n🖼️  已加载 ${referenceImagesBase64.length} 张参考图，将全部传递给 AI`);
  }

  console.log("─".repeat(60));

  // 构建消息 - 明确指定科普教学风格
  const message = `创作一篇小红书笔记，主题是"大白话讲 Transformer"。

要求：
1. 目标读者：完全不懂Transformer的普通人，用最通俗的语言解释
2. 内容结构：
   - 开头：用一个生活化比喻引入（比如"就像你读句子时不是逐字看，而是一眼看整个句子"）
   - 核心概念：用聊天记录/快递分拣等日常例子解释 Self-Attention
   - 结尾：总结Transformer为什么重要，对AI意味着什么
3. 风格：轻松幽默，像在和朋友聊天，避免术语堆砌
4. 字数：控制在 800-1200 字，适合小红书阅读
5. 标签：#人工智能 #Transformer #科普 #机器学习 #AI`;

  const events: AgentEvent[] = [];
  const toolCalls: { tool: string; agent: string; time: string }[] = [];

  try {
    const requestBody: any = {
      message,
      themeId: null, // 不依赖现有主题，从头创作
      imageGenProvider,
    };

    // 使用全部参考图（多参考图模式）
    if (referenceImagesBase64.length > 0) {
      if (useMultiRef) {
        requestBody.referenceImages = referenceImagesBase64; // 全部传给 AI
      } else {
        requestBody.referenceImages = referenceImagesBase64; // 默认也全部传递
      }
      console.log(`\n📤 发送请求到 Agent (${referenceImagesBase64.length} 张参考图)...\n`);
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
          // 忽略解析错误
        }
      }
    }
  } catch (error: any) {
    console.error("\n" + "═".repeat(60));
    console.error("❌ 测试失败");
    console.error("═".repeat(60));
    console.error(`错误: ${error.message}`);
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
      console.log(`${prefix} 🔧 ${event.agent || "系统"} 调用: ${event.tool}`);
      toolCalls.push({ tool: event.tool!, agent: event.agent!, time });
      break;

    case "tool_result":
      const content = event.content;
      if (content.includes("成功") || content.includes("完成")) {
        console.log(`${prefix} ✅ ${event.tool}: 成功`);
      } else if (content.includes("失败") || content.includes("错误")) {
        console.log(`${prefix} ❌ ${event.tool}: 失败`);
      } else {
        console.log(`${prefix} 📊 ${event.tool}: 已返回`);
      }
      break;

    case "message":
      console.log(`${prefix} 💬 ${event.agent || "系统"}:`);
      // 显示前 500 字符
      const displayContent = content.length > 500 ? content.slice(0, 500) + "..." : content;
      console.log(displayContent);
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
    console.log("\n工具调用统计:");
    const toolStats: Record<string, number> = {};
    toolCalls.forEach((tc) => {
      toolStats[tc.tool] = (toolStats[tc.tool] || 0) + 1;
    });
    Object.entries(toolStats).forEach(([tool, count]) => {
      console.log(`  - ${tool}: ${count} 次`);
    });
  }

  // 检查生成的图片
  const imageGenEvents = events.filter(
    (e) => e.type === "tool_call" && (e.tool === "generate_with_reference" || e.tool === "generate_image")
  );
  if (imageGenEvents.length > 0) {
    console.log(`\n🖼️  图片生成: ${imageGenEvents.length} 张`);
    console.log(`   保存位置: ${assetsPath}`);

    if (fs.existsSync(assetsPath)) {
      const files = fs.readdirSync(assetsPath).filter((f) => f.endsWith(".png"));
      const recentFiles = files
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(assetsPath, f)).mtime }))
        .filter((f) => Date.now() - f.mtime.getTime() < 300000) // 5分钟内
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (recentFiles.length > 0) {
        console.log(`   生成的图片:`);
        recentFiles.forEach((f) => {
          const size = fs.statSync(path.join(assetsPath, f.name)).size;
          console.log(`     - ${f.name} (${Math.round(size / 1024)}KB)`);
        });
      }
    }
  }

  // 提取 writer_agent 生成的内容
  const writerEvents = events.filter((e) => e.type === "message" && e.agent === "writer_agent");
  if (writerEvents.length > 0) {
    const lastContent = writerEvents[writerEvents.length - 1].content;
    console.log("\n" + "─".repeat(60));
    console.log("📝 生成的笔记内容:");
    console.log("─".repeat(60));

    // 提取标题
    const titleMatch = lastContent.match(/标题[：:]\s*(.+)/i) || lastContent.match(/#\S+\s*.+/);
    if (titleMatch && titleMatch[1]) {
      console.log(`\n🎯 标题: ${titleMatch[1].slice(0, 50)}`);
    }

    // 显示部分内容预览
    const contentPreview = lastContent.slice(0, 300);
    console.log(contentPreview + "...");
  }

  console.log("\n" + "═".repeat(60));
  console.log("✅ 测试完成!");
  console.log("═".repeat(60));
  console.log("\n💡 提示:");
  console.log("   - 查看生成的图片: open " + assetsPath);
  console.log("   - 使用不同模型: --provider gemini");
  console.log("   - 多参考图模式: --multi-ref");
  console.log("═".repeat(60));
}

testTransformerNote();
