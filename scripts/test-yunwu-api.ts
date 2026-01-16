/**
 * 测试 yunwu.ai API 连接
 */

import { db, schema } from "../src/server/db";
import { eq } from "drizzle-orm";

async function testYunwuAPI() {
  console.log("🔍 获取 Vision 模型配置...");

  const providers = await db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.supportsVision, true));

  if (providers.length === 0) {
    console.error("❌ 未找到 Vision 模型配置");
    return;
  }

  const provider = providers[0];

  console.log("📋 模型配置:");
  console.log(`   名称: ${provider.name}`);
  console.log(`   模型: ${provider.modelName}`);
  console.log(`   Base URL: ${provider.baseUrl}`);
  console.log(`   API Key: ${provider.apiKey?.slice(0, 20)}...`);

  console.log("\n🚀 测试 API 连接...");

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.modelName,
        messages: [{ role: "user", content: "Hello, say 'API OK' in 2 words" }],
        max_tokens: 10,
      }),
    });

    console.log(`   HTTP Status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ API 错误: ${text}`);
      return;
    }

    const data = await response.json();
    console.log("✅ API 响应成功!");
    console.log(`   回复: ${data.choices?.[0]?.message?.content || JSON.stringify(data)}`);
  } catch (err: any) {
    console.error("❌ 连接失败:", err.message);
    if (err.cause) {
      console.error("   原因:", err.cause.message || err.cause);
    }
  }
}

testYunwuAPI();
