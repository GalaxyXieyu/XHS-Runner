/**
 * 测试 Gemini 图片生成 API
 */

import { db, schema } from "../src/server/db";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function testImageGen() {
  console.log("🔍 获取图片生成模型配置...");

  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(and(
      eq(schema.llmProviders.isEnabled, 1),
      eq(schema.llmProviders.supportsImageGen, true)
    ));

  if (providers.length === 0) {
    console.error("❌ 未找到支持图片生成的模型配置");
    console.log("请在设置中添加支持图片生成的模型（如 Gemini）");
    return;
  }

  const provider = providers[0];
  // 移除 /v1 后缀
  const baseUrl = (provider.baseUrl || 'https://yunwu.ai').replace(/\/v1$/, '');

  console.log("📋 模型配置:");
  console.log(`   名称: ${provider.name}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   API Key: ${provider.apiKey?.slice(0, 20)}...`);

  // 读取参考图
  const imagePath = "./scripts/references/如何让AI「抄」参考图？【附指令词】_1_珍珠奶茶_来自小红书网页版.jpg";
  const absolutePath = path.join(process.cwd(), imagePath);

  let referenceImageData: any = null;
  if (fs.existsSync(absolutePath)) {
    const imageBuffer = fs.readFileSync(absolutePath);
    const base64Data = imageBuffer.toString("base64");
    referenceImageData = { inlineData: { mimeType: "image/jpeg", data: base64Data } };
    console.log(`\n📷 参考图大小: ${Math.round(base64Data.length / 1024)}KB`);
  } else {
    console.log("\n⚠️ 参考图不存在，将不使用参考图");
  }

  // 使用与参考实现一致的模型名称
  const modelName = 'gemini-3-pro-image-preview';
  console.log(`\n🚀 测试模型: ${modelName}`);

  const parts: any[] = [
    { text: "Generate a beautiful coffee cup on a minimalist wooden table, soft natural lighting, professional photography style, vertical composition 3:4 aspect ratio" }
  ];

  if (referenceImageData) {
    parts.push(referenceImageData);
  }

  const requestBody = {
    contents: [{
      parts
    }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: "3:4"
      }
    }
  };

  const apiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent`;
  console.log(`   API URL: ${apiUrl}`);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": provider.apiKey || "",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(300000), // 5分钟超时
    });

    console.log(`   HTTP Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ 错误: ${errorText.slice(0, 500)}`);
      return;
    }

    const data = await response.json();
    console.log(`   响应: ${JSON.stringify(data).slice(0, 300)}...`);

    // 检查是否有图片返回
    const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    const textPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text);

    if (imagePart?.inlineData) {
      console.log(`   ✅ 成功! 返回图片 (${Math.round(imagePart.inlineData.data.length / 1024)}KB)`);
      console.log(`   MIME Type: ${imagePart.inlineData.mimeType}`);

      // 保存图片
      const outputPath = "./scripts/test-output.png";
      const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
      fs.writeFileSync(outputPath, imageBuffer);
      console.log(`   📁 图片已保存: ${outputPath}`);
    } else if (textPart?.text) {
      console.log(`   ⚠️ 只返回文本: ${textPart.text.slice(0, 200)}...`);
    } else {
      console.log(`   ⚠️ 未知响应格式:`, JSON.stringify(data).slice(0, 500));
    }

  } catch (err: any) {
    console.log(`   ❌ 请求失败: ${err.message}`);
  }

  console.log("\n✅ 测试完成");
}

testImageGen();
