/**
 * 测试意图识别功能
 */
import { detectIntent } from "../src/server/agents/tools/intentTools";

const testCases = [
  "帮我写一篇关于护肤的小红书文案",
  "分析这张图片的风格",
  "生成3张配图",
  "看看最近有什么热门趋势",
  "优化一下这篇文章的结构",
  "创作一个吸引人的标题",
];

console.log("🧪 测试意图识别\n");

for (const message of testCases) {
  const result = detectIntent(message);
  console.log(`📝 "${message}"`);
  console.log(`   意图: ${result.intent}`);
  console.log(`   置信度: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`   推荐分类: ${result.suggestedCategory || "无"}`);
  console.log(`   关键词: ${result.keywords.join(", ") || "无"}`);
  console.log();
}

console.log("✅ 测试完成");
