/**
 * 测试 Superbed 上传功能
 */
import fs from 'fs';
import path from 'path';

const SUPERBED_TOKEN = "00fbe01340604063b1f59aedc0481ddc";

async function testSuperbedUpload() {
  // 读取测试图片
  const imagePath = path.join(__dirname, 'references/如何让AI「抄」参考图？【附指令词】_1_珍珠奶茶_来自小红书网页版.jpg');

  if (!fs.existsSync(imagePath)) {
    console.error('测试图片不存在:', imagePath);
    return;
  }

  const imageBuffer = fs.readFileSync(imagePath);
  console.log('图片大小:', Math.round(imageBuffer.length / 1024), 'KB');

  // 方式1: 直接上传文件
  console.log('\n=== 方式1: 直接上传文件 ===');
  try {
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'test.jpg');

    const response = await fetch(`https://api.superbed.cn/upload?token=${SUPERBED_TOKEN}`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    console.log('响应:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('错误:', e);
  }

  // 方式2: 使用 base64
  console.log('\n=== 方式2: base64 上传 ===');
  try {
    const base64 = imageBuffer.toString('base64');
    console.log('Base64 长度:', base64.length);

    // 尝试不同的 API 端点
    const response = await fetch(`https://api.superbed.cn/upload?token=${SUPERBED_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: `data:image/jpeg;base64,${base64}`,
      }),
    });
    const result = await response.json();
    console.log('响应:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('错误:', e);
  }

  // 方式3: 检查 API 文档
  console.log('\n=== 方式3: 查看 API 信息 ===');
  try {
    const response = await fetch(`https://api.superbed.cn/info?token=${SUPERBED_TOKEN}`);
    const result = await response.json();
    console.log('账户信息:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('错误:', e);
  }
}

testSuperbedUpload().catch(console.error);
