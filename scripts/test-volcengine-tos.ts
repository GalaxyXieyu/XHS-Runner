/**
 * 测试火山引擎 TOS 图片上传
 * 用法: npx tsx scripts/test-volcengine-tos.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getSetting } from "../src/server/settings";
import { getExtensionServiceByType } from "../src/server/services/extensionService";

const REFERENCES_DIR = path.join(process.cwd(), "scripts", "references");
const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv";
const VERSION = "2022-08-31";

// 获取火山引擎配置
async function getVolcengineConfig() {
    let accessKey = "";
    let secretKey = "";

    if (!accessKey || !secretKey) {
        try {
            const imageService = await getExtensionServiceByType("image");
            if (imageService?.config_json) {
                const config = JSON.parse(imageService.config_json);
                accessKey = accessKey || config.volcengine_access_key || "";
                secretKey = secretKey || config.volcengine_secret_key || "";
            }
        } catch { }
    }

    if (!accessKey || !secretKey) {
        try {
            accessKey = accessKey || (await getSetting("volcengineAccessKey")) || "";
            secretKey = secretKey || (await getSetting("volcengineSecretKey")) || "";
        } catch { }
    }

    return { accessKey, secretKey };
}

// 签名函数
function sign(key: Buffer, msg: string): Buffer {
    return crypto.createHmac("sha256", key).update(msg).digest();
}

function getSignatureKey(secretKey: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = sign(Buffer.from(secretKey, "utf-8"), dateStamp);
    const kRegion = sign(kDate, regionName);
    const kService = sign(kRegion, serviceName);
    return sign(kService, "request");
}

function generateVolcengineSignature(
    method: string,
    pathStr: string,
    query: string,
    headers: Record<string, string>,
    body: string,
    timestamp: string,
    secretKey: string,
    accessKey: string
): string {
    const sortedHeaders = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaders
        .map((key) => `${key.toLowerCase()}:${headers[key].trim()}`)
        .join("\n") + "\n";
    const signedHeaders = sortedHeaders.map((key) => key.toLowerCase()).join(";");
    const payloadHash = crypto.createHash("sha256").update(body).digest("hex");
    const canonicalRequest = [method, pathStr, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const hashedCanonicalRequest = crypto.createHash("sha256").update(canonicalRequest).digest("hex");
    const date = timestamp.substring(0, 8);
    const credentialScope = `${date}/${REGION}/${SERVICE}/request`;
    const stringToSign = ["HMAC-SHA256", timestamp, credentialScope, hashedCanonicalRequest].join("\n");
    const signingKey = getSignatureKey(secretKey, date, REGION, SERVICE);
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    return `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// 获取图片上传预签名地址
async function getImageUploadAddress(accessKey: string, secretKey: string): Promise<{ uploadUrl: string; storeUri: string }> {
    const requestBody = {
        req_key: "GetImageUploadAddress",
        service_id: "cv"
    };

    const bodyStr = JSON.stringify(requestBody);
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const payloadHash = crypto.createHash("sha256").update(bodyStr).digest("hex");

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Host": HOST,
        "X-Date": timestamp,
        "X-Content-Sha256": payloadHash,
    };

    const query = `Action=CVProcess&Version=${VERSION}`;
    headers["Authorization"] = generateVolcengineSignature(
        "POST",
        "/",
        query,
        headers,
        bodyStr,
        timestamp,
        secretKey,
        accessKey
    );

    const apiUrl = `https://${HOST}/?${query}`;
    console.log(`   请求 GetImageUploadAddress...`);

    const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: bodyStr,
    });

    const result: any = await response.json();
    console.log(`   响应:`, JSON.stringify(result, null, 2));

    if (result.code !== 10000) {
        throw new Error(`GetImageUploadAddress 失败: ${result.message || JSON.stringify(result)}`);
    }

    return {
        uploadUrl: result.data?.upload_url,
        storeUri: result.data?.store_uri,
    };
}

// 上传图片到 TOS
async function uploadImageToTOS(uploadUrl: string, imageBuffer: Buffer): Promise<void> {
    console.log(`   上传图片到 TOS...`);
    const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type": "image/jpeg",
        },
        body: new Uint8Array(imageBuffer),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`TOS 上传失败: ${response.status} ${text}`);
    }
    console.log(`   上传成功!`);
}

async function main() {
    console.log("═".repeat(60));
    console.log("🧪 火山引擎 TOS 上传测试");
    console.log("═".repeat(60));

    // 1. 获取配置
    console.log("\n📋 获取火山引擎配置...");
    const { accessKey, secretKey } = await getVolcengineConfig();
    if (!accessKey || !secretKey) {
        console.error("❌ 未找到火山引擎 Access Key / Secret Key");
        process.exit(1);
    }
    console.log(`✅ 已获取配置 (AK: ${accessKey.slice(0, 8)}...)`);

    // 2. 读取测试图片
    const files = fs.readdirSync(REFERENCES_DIR).filter((f) => f.endsWith(".jpg") || f.endsWith(".png"));
    if (files.length === 0) {
        console.error("❌ 未找到测试图片");
        process.exit(1);
    }

    const testFile = files[0];
    const filePath = path.join(REFERENCES_DIR, testFile);
    const imageBuffer = fs.readFileSync(filePath);
    console.log(`\n🖼️ 测试图片: ${testFile} (${Math.round(imageBuffer.length / 1024)}KB)`);

    // 3. 获取上传地址
    console.log("\n📤 获取上传预签名地址...");
    try {
        const { uploadUrl, storeUri } = await getImageUploadAddress(accessKey, secretKey);
        console.log(`   uploadUrl: ${uploadUrl}`);
        console.log(`   storeUri: ${storeUri}`);

        // 4. 上传图片
        await uploadImageToTOS(uploadUrl, imageBuffer);

        // 5. 生成访问 URL
        const imageUrl = `https://imagex.volccdnx.com/${storeUri}`;
        console.log(`\n✅ 上传成功!`);
        console.log(`   图片 URL: ${imageUrl}`);

    } catch (error: any) {
        console.error(`\n❌ 失败: ${error.message}`);
    }

    console.log("\n" + "═".repeat(60));
}

main().catch(console.error);
