/**
 * 测试图片生成 Provider 接口 - 支持 Gemini 和 Jimeng
 * 用法: npx tsx scripts/test-image-provider.ts [gemini|jimeng] [--batch] [--multi]
 *
 * 选项:
 *   --batch    批量测试 (3张)
 *   --multi    多参考图测试 (2张参考图)
 *   --single   单张测试 (默认)
 */

import { generateImageWithReference } from "../src/server/services/xhs/integration/imageProvider";
import fs from "fs";
import path from "path";
import { config } from "dotenv";
config({ path: ".env.local" });

// 本地参考图文件
const REFERENCES_DIR = path.join(process.cwd(), "scripts", "references");
const LOCAL_REFERENCE_FILES = [
  "如何让AI「抄」参考图？【附指令词】_1_珍珠奶茶_来自小红书网页版.jpg",
  "如何让AI「抄」参考图？【附指令词】_3_珍珠奶茶_来自小红书网页版.jpg",
];

import { getSetting } from "../src/server/settings";
import { getExtensionServiceByType } from "../src/server/services/extensionService";

// 获取 Superbed Token（优先数据库）
async function getSuperbedToken(): Promise<string> {
  let token = "";

  if (!token) {
    try {
      const imagehostService = await getExtensionServiceByType("imagehost");
      if (imagehostService?.api_key) {
        token = imagehostService.api_key;
      }
    } catch { }
  }

  if (!token) {
    try {
      token = (await getSetting("superbedToken")) || "";
    } catch { }
  }

  return token;
}

// 上传本地文件到 Superbed 获取 URL
async function uploadLocalFileToSuperbed(filePath: string): Promise<string> {
  const token = await getSuperbedToken();
  if (!token) {
    throw new Error("SUPERBED_TOKEN 未配置（环境变量和数据库均未找到）");
  }

  const buffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const formData = new FormData();
  formData.append("file", blob, filename);

  const response = await fetch(`https://api.superbed.cn/upload?token=${token}`, {
    method: "POST",
    body: formData,
  });
  const result = await response.json();
  if (result.err !== 0 || !result.url) {
    throw new Error(`Superbed上传失败: ${result.msg || "未知错误"}`);
  }

  // Superbed URL 会 302 重定向到百度云 CDN，即梦无法跟随重定向
  // 手动解析获取最终直链
  const superbedUrl = result.url;
  try {
    const redirectRes = await fetch(superbedUrl, { method: "HEAD", redirect: "manual" });
    const directUrl = redirectRes.headers.get("location");
    if (directUrl && directUrl.startsWith("http")) {
      console.log(`   📤 已上传参考图: ${filename}`);
      console.log(`      Superbed: ${superbedUrl}`);
      console.log(`      直链: ${directUrl}`);
      return directUrl;
    }
  } catch (e) {
    console.warn("   ⚠️ 重定向解析失败，使用原 URL");
  }
  console.log(`   📤 已上传参考图: ${filename} -> ${superbedUrl}`);
  return superbedUrl;
}

// 获取参考图 URL（上传本地文件）
async function getReferenceImageUrls(count: number = 1): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < Math.min(count, LOCAL_REFERENCE_FILES.length); i++) {
    const filePath = path.join(REFERENCES_DIR, LOCAL_REFERENCE_FILES[i]);
    const url = await uploadLocalFileToSuperbed(filePath);
    urls.push(url);
  }
  return urls;
}

async function testSingle(provider: "gemini" | "jimeng") {
  console.log(`\n🧪 测试 ${provider} 单张生成 (使用本地参考图)`);
  console.log("─".repeat(50));

  console.log("📤 上传参考图到 Superbed...");
  const referenceUrls = await getReferenceImageUrls(1);

  const prompt = "[画面内容] 3D 微缩桌面特写：打开的笔记本屏幕显示代码编辑器";
  console.log(`📝 Prompt: ${prompt}`);
  console.log(`🖼️ Reference: ${referenceUrls[0]}`);

  const startTime = Date.now();
  try {
    const result = await generateImageWithReference({
      prompt,
      referenceImageUrls: referenceUrls,
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

async function testMultiReference(provider: "gemini" | "jimeng") {
  console.log(`\n🧪 测试 ${provider} 多参考图生成 (2张本地参考图)`);
  console.log("─".repeat(50));

  console.log("📤 上传参考图到 Superbed...");
  const referenceUrls = await getReferenceImageUrls(2);

  const prompt = "[画面内容] 3D 微缩场景：咖啡杯放在笔记本旁边，简约风格";
  console.log(`📝 Prompt: ${prompt}`);
  console.log(`🖼️ References (${referenceUrls.length}张):`);
  referenceUrls.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));

  const startTime = Date.now();
  try {
    const result = await generateImageWithReference({
      prompt,
      referenceImageUrls: referenceUrls,
      provider,
      aspectRatio: "3:4",
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ 成功 (${elapsed}s)`);
    console.log(`   大小: ${Math.round(result.imageBuffer.length / 1024)}KB`);
    console.log(`   Provider: ${result.provider}`);

    const outputPath = path.join(process.cwd(), "scripts", `test-${provider}-multi-output.png`);
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
  console.log(`\n🧪 测试 ${provider} 批量生成 (${count}张，串行，使用本地参考图)`);
  console.log("─".repeat(50));

  console.log("📤 上传参考图到 Superbed...");
  const referenceUrls = await getReferenceImageUrls(1);

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
        referenceImageUrls: referenceUrls,
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
  const isMulti = args.includes("--multi");
  const isSingle = args.includes("--single") || (!isBatch && !isMulti);

  console.log("═".repeat(60));
  console.log(`🚀 图片生成 Provider 测试 - ${provider.toUpperCase()}`);
  console.log("═".repeat(60));

  if (isMulti) {
    await testMultiReference(provider);
  } else if (isBatch) {
    await testBatch(provider);
  } else {
    await testSingle(provider);
  }

  console.log("\n" + "═".repeat(60));
  console.log("📋 测试选项:");
  console.log("   npx tsx scripts/test-image-provider.ts gemini        # 单张测试");
  console.log("   npx tsx scripts/test-image-provider.ts gemini --multi # 多参考图测试");
  console.log("   npx tsx scripts/test-image-provider.ts gemini --batch # 批量测试");
  console.log("═".repeat(60));
  process.exit(0);
}

main();
