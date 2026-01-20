/**
 * 测试 Gemini Vision API
 */

import { db, schema } from "../src/server/db";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function testGeminiVision() {
  console.log("🔍 获取 Vision 模型配置...");

  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(and(
      eq(schema.llmProviders.isEnabled, true),
      eq(schema.llmProviders.supportsVision, true)
    ));

  if (providers.length === 0) {
    console.error("❌ 未找到 Vision 模型配置");
    return;
  }

  const provider = providers[0];
  const baseUrl = (provider.baseUrl || 'https://yunwu.ai').replace(/\/v1$/, '');
  const modelName = provider.modelName || 'gemini-2.0-flash';

  console.log("📋 模型配置:");
  console.log(`   名称: ${provider.name}`);
  console.log(`   模型: ${modelName}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   API Key: ${provider.apiKey?.slice(0, 20)}...`);

  // 读取测试图片
  const imagePath = "./scripts/references/如何让AI「抄」参考图？【附指令词】_1_珍珠奶茶_来自小红书网页版.jpg";
  const absolutePath = path.join(process.cwd(), imagePath);

  if (!fs.existsSync(absolutePath)) {
    console.error("❌ 测试图片不存在:", absolutePath);
    return;
  }

  const imageBuffer = fs.readFileSync(absolutePath);
  const base64Data = imageBuffer.toString("base64");
  console.log(`\n📷 图片大小: ${Math.round(base64Data.length / 1024)}KB`);

  // 构建请求
  const requestBody = {
    contents: [{
      parts: [
        {
          text: `分析这张图片的视觉风格特征，输出 JSON 格式：
{
  "style": "minimalist|realistic|illustration|photography|artistic",
  "colorPalette": ["主色调1", "主色调2", "主色调3"],
  "mood": "warm|cool|vibrant|soft|elegant|modern|vintage",
  "composition": "centered|rule-of-thirds|symmetrical|dynamic|minimal",
  "lighting": "natural|studio|soft|dramatic|flat",
  "texture": "smooth|textured|matte|glossy|grainy",
  "description": "一句话风格描述，用于后续生图提示词，英文"
}
只输出 JSON，不要其他内容。`
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    }
  };

  const apiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent`;
  console.log(`\n🚀 测试 API: ${apiUrl}`);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": provider.apiKey || "",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`   HTTP Status: ${response.status}`);

    const responseText = await response.text();
    console.log(`   Response length: ${responseText.length}`);

    if (!response.ok) {
      console.error("❌ API 错误:", responseText);
      return;
    }

    const data = JSON.parse(responseText);
    console.log("\n📊 API 响应:");
    console.log(JSON.stringify(data, null, 2));

    // 提取文本内容
    const textContent = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
    if (textContent) {
      console.log("\n✅ 分析结果:");
      console.log(textContent);
    } else {
      console.log("\n⚠️ 未找到文本内容");
      console.log("candidates:", JSON.stringify(data.candidates, null, 2));
    }

  } catch (err: any) {
    console.error("❌ 请求失败:", err.message);
    if (err.cause) {
      console.error("   原因:", err.cause.message || err.cause);
    }
  }
}

testGeminiVision();
