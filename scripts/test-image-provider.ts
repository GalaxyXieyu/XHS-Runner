/**
 * 测试图片生成 Provider 接口 - 支持 Gemini 和 Jimeng
 * 用法: npx tsx scripts/test-image-provider.ts [gemini|jimeng] [--batch]
 */

import { generateImageWithReference } from "../src/server/services/xhs/integration/imageProvider";
import fs from "fs";
import path from "path";

const REFERENCE_IMAGE_URL = "https://picsum.photos/400/300";

async function testSingle(provider: "gemini" | "jimeng") {
  console.log(`\n🧪 测试 ${provider} 单张生成`);
  console.log("─".repeat(50));

  const prompt = "[画面内容] 3D 微缩桌面特写：打开的笔记本屏幕显示代码编辑器";
  console.log(`📝 Prompt: ${prompt}`);
  console.log(`🖼️ Reference: ${REFERENCE_IMAGE_URL}`);

  const startTime = Date.now();
  try {
    const result = await generateImageWithReference({
      prompt,
      referenceImageUrl: REFERENCE_IMAGE_URL,
      provider,
      aspectRatio: "3:4",
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ 成功 (${elapsed}s)`);
    console.log(`   大小: ${Math.round(result.imageBuffer.length / 1024)}KB`);
    console.log(`   Provider: ${result.provider}`);

    const outputPath = path.join(process.cwd(), "scripts", `test-${provider}-output.png`);
    fs.writeFileSync(outputPath, result.imageBuffer);
    console.log(`   保存: ${outputPath}`);
    return true;
  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ 失败 (${elapsed}s): ${error.message}`);
    return false;
  }
}

async function testBatch(provider: "gemini" | "jimeng", count = 3) {
  console.log(`\n🧪 测试 ${provider} 批量生成 (${count}张，串行)`);
  console.log("─".repeat(50));

  const prompts = [
    "[画面内容] 3D 微缩场景：咖啡杯旁边的小型工作台",
    "[画面内容] 3D 微缩场景：书架上的迷你植物盆栽",
    "[画面内容] 3D 微缩场景：窗台上的小猫咪玩具",
  ];

  const startTime = Date.now();
  const results: boolean[] = [];

  for (let i = 0; i < Math.min(count, prompts.length); i++) {
    console.log(`\n[${i + 1}/${count}] ${prompts[i].slice(0, 30)}...`);
    const itemStart = Date.now();

    try {
      const result = await generateImageWithReference({
        prompt: prompts[i],
        referenceImageUrl: REFERENCE_IMAGE_URL,
        provider,
        aspectRatio: "3:4",
      });

      const elapsed = ((Date.now() - itemStart) / 1000).toFixed(1);
      console.log(`   ✅ 成功 (${elapsed}s) - ${Math.round(result.imageBuffer.length / 1024)}KB`);

      const outputPath = path.join(process.cwd(), "scripts", `test-${provider}-batch-${i}.png`);
      fs.writeFileSync(outputPath, result.imageBuffer);
      results.push(true);
    } catch (error: any) {
      const elapsed = ((Date.now() - itemStart) / 1000).toFixed(1);
      console.error(`   ❌ 失败 (${elapsed}s): ${error.message}`);
      results.push(false);
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = results.filter(Boolean).length;
  console.log(`\n📊 批量结果: ${successCount}/${count} 成功 (总耗时 ${totalElapsed}s)`);
  return successCount === count;
}

async function main() {
  const args = process.argv.slice(2);
  const provider = (args.find((a) => a === "gemini" || a === "jimeng") || "gemini") as "gemini" | "jimeng";
  const isBatch = args.includes("--batch");

  console.log("═".repeat(60));
  console.log(`🚀 图片生成 Provider 测试 - ${provider.toUpperCase()}`);
  console.log("═".repeat(60));

  if (isBatch) {
    await testBatch(provider);
  } else {
    await testSingle(provider);
  }

  console.log("\n" + "═".repeat(60));
  process.exit(0);
}

main();
