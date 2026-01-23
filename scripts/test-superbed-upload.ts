/**
 * 测试 Superbed 图片上传功能
 * 用法: npx tsx scripts/test-superbed-upload.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { getSetting } from "../src/server/settings";
import { getExtensionServiceByType } from "../src/server/services/extensionService";

const REFERENCES_DIR = path.join(process.cwd(), "scripts", "references");

async function getSuperbedToken(): Promise<string> {
    // 优先数据库
    let token = "";

    if (!token) {
        try {
            // 尝试从 extension_services 表读取
            const imagehostService = await getExtensionServiceByType("imagehost");
            if (imagehostService?.api_key) {
                token = imagehostService.api_key;
            }
        } catch { }
    }

    if (!token) {
        try {
            // 尝试从 settings 表读取
            token = (await getSetting("superbedToken")) || "";
        } catch { }
    }

    return token;
}

async function uploadFileToSuperbed(filePath: string, token: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);

    console.log(`   文件大小: ${Math.round(buffer.length / 1024)}KB`);

    const blob = new Blob([buffer], { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("file", blob, filename);

    const url = `https://api.superbed.cn/upload?token=${token}`;
    console.log(`   请求地址: ${url.replace(token, "****")}`);

    const response = await fetch(url, {
        method: "POST",
        body: formData,
    });

    console.log(`   HTTP状态: ${response.status} ${response.statusText}`);

    const result = await response.json();
    console.log(`   返回结果:`, JSON.stringify(result, null, 2));

    if (result.err !== 0 || !result.url) {
        throw new Error(`上传失败: ${result.msg || "未知错误"} (err=${result.err})`);
    }

    return result.url;
}

async function main() {
    console.log("═".repeat(60));
    console.log("🧪 Superbed 上传测试");
    console.log("═".repeat(60));

    // 获取 Token
    console.log("\n📋 获取 Superbed Token...");
    const token = await getSuperbedToken();
    if (!token) {
        console.error("❌ 未找到 Superbed Token，请检查配置");
        process.exit(1);
    }
    console.log(`✅ Token 已获取 (长度: ${token.length})`);

    // 列出参考图
    const files = fs.readdirSync(REFERENCES_DIR).filter(f => f.endsWith(".jpg") || f.endsWith(".png"));
    console.log(`\n📂 找到 ${files.length} 张参考图`);

    const results: { file: string; success: boolean; url?: string; error?: string }[] = [];

    for (const file of files) {
        const filePath = path.join(REFERENCES_DIR, file);
        console.log(`\n🖼️ 上传: ${file}`);

        try {
            const url = await uploadFileToSuperbed(filePath, token);
            console.log(`   ✅ 成功: ${url}`);
            results.push({ file, success: true, url });
        } catch (error: any) {
            console.error(`   ❌ 失败: ${error.message}`);
            results.push({ file, success: false, error: error.message });
        }
    }

    // 统计
    console.log("\n" + "═".repeat(60));
    console.log("📊 测试结果");
    console.log("─".repeat(60));
    const successCount = results.filter(r => r.success).length;
    console.log(`成功: ${successCount}/${files.length}`);

    if (successCount > 0) {
        console.log("\n成功上传的 URL:");
        results.filter(r => r.success).forEach(r => console.log(`  - ${r.url}`));
    }

    if (successCount < files.length) {
        console.log("\n失败的上传:");
        results.filter(r => !r.success).forEach(r => console.log(`  - ${r.file}: ${r.error}`));
    }

    console.log("═".repeat(60));
    process.exit(successCount === files.length ? 0 : 1);
}

main().catch(console.error);
