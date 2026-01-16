/**
 * 测试火山引擎即梦图片生成 API
 */

import { generateImage } from "../src/server/services/xhs/integration/imageProvider";
import fs from "fs";
import path from "path";

async function testJimeng() {
  console.log("🔍 测试火山引擎即梦图片生成...\n");

  // 读取参考图
  const imagePath = "./scripts/references/如何让AI「抄」参考图？【附指令词】_1_珍珠奶茶_来自小红书网页版.jpg";
  const absolutePath = path.join(process.cwd(), imagePath);

  let referenceImageUrl: string | undefined;
  if (fs.existsSync(absolutePath)) {
    const imageBuffer = fs.readFileSync(absolutePath);
    const base64Data = imageBuffer.toString("base64");
    referenceImageUrl = `data:image/jpeg;base64,${base64Data}`;
    console.log(`📷 参考图大小: ${Math.round(base64Data.length / 1024)}KB`);
  } else {
    console.log("⚠️ 参考图不存在，将不使用参考图");
  }

  const prompt = "一杯精美的咖啡，放在简约的木桌上，柔和的自然光线，专业摄影风格，竖版构图";
  console.log(`📝 提示词: ${prompt}`);
  console.log(`🎨 模型: jimeng (火山引擎即梦)\n`);

  try {
    const result = await generateImage({
      prompt,
      model: "jimeng",
      images: referenceImageUrl ? [referenceImageUrl] : undefined,
    });

    console.log(`✅ 成功! 返回图片 (${Math.round(result.imageBuffer.length / 1024)}KB)`);
    console.log(`📊 元数据:`, result.metadata);

    // 保存图片
    const outputPath = "./scripts/test-jimeng-output.png";
    fs.writeFileSync(outputPath, result.imageBuffer);
    console.log(`📁 图片已保存: ${outputPath}`);

  } catch (err: any) {
    console.log(`❌ 请求失败: ${err.message}`);
    if (err.message.includes("VOLCENGINE_NOT_CONFIGURED")) {
      console.log("\n💡 请在设置中配置火山引擎 Access Key 和 Secret Key");
    }
    if (err.message.includes("SUPERBED_NOT_CONFIGURED")) {
      console.log("\n💡 请在设置中配置 Superbed Token (用于上传参考图)");
    }
  }

  console.log("\n✅ 测试完成");
}

testJimeng();
