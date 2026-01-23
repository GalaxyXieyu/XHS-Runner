/**
 * 直接测试 generate_with_reference 工具
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { generateImageWithReference } from "../src/server/services/xhs/integration/imageProvider";

const REFERENCES_DIR = path.join(process.cwd(), "scripts", "references");

async function main() {
    console.log("═".repeat(60));
    console.log("🧪 直接测试 generateImageWithReference");
    console.log("═".repeat(60));

    // 读取第一张参考图
    const files = fs.readdirSync(REFERENCES_DIR).filter((f) => f.endsWith(".jpg") || f.endsWith(".png"));
    if (files.length === 0) {
        console.error("❌ 未找到参考图");
        process.exit(1);
    }

    const testFile = files[0];
    const filePath = path.join(REFERENCES_DIR, testFile);
    const buffer = fs.readFileSync(filePath);
    const base64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    console.log(`📷 参考图: ${testFile} (${Math.round(buffer.length / 1024)}KB)`);

    const prompt = "[画面内容] 3D 微缩场景：可爱的小机器人在打字";
    console.log(`📝 Prompt: ${prompt}`);
    console.log(`🎨 Provider: jimeng`);
    console.log("─".repeat(60));

    const startTime = Date.now();
    try {
        console.log("\n⏳ 开始生成...");
        const result = await generateImageWithReference({
            prompt,
            referenceImageUrls: [base64], // 直接传 base64
            provider: "jimeng",
            aspectRatio: "3:4",
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ 成功 (${elapsed}s)`);
        console.log(`   大小: ${Math.round(result.imageBuffer.length / 1024)}KB`);
        console.log(`   Provider: ${result.provider}`);

        const outputPath = path.join(process.cwd(), "scripts", "test-tool-output.png");
        fs.writeFileSync(outputPath, result.imageBuffer);
        console.log(`   保存: ${outputPath}`);
    } catch (error: any) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`\n❌ 失败 (${elapsed}s)`);
        console.error(`   错误: ${error.message}`);
        if (error.cause) {
            console.error(`   原因: ${JSON.stringify(error.cause)}`);
        }
    }

    console.log("\n" + "═".repeat(60));
}

main().catch(console.error);
