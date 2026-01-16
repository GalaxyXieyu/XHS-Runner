/**
 * 调试二维码获取 - 查看页面实际状态
 */
import puppeteer from 'puppeteer';

async function debugQRCode() {
  console.log('🔍 调试二维码获取...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();

  // 设置 User-Agent
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // 监听页面导航
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log(`📍 页面导航到: ${frame.url()}`);
    }
  });

  try {
    console.log('1️⃣ 导航到登录页面...');
    await page.goto('https://www.xiaohongshu.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    console.log(`   当前URL: ${page.url()}`);

    // 等待一下看看是否有跳转
    console.log('\n2️⃣ 等待 5 秒观察页面状态...');
    await new Promise((r) => setTimeout(r, 5000));
    console.log(`   当前URL: ${page.url()}`);

    // 截图保存
    console.log('\n3️⃣ 截图保存...');
    await page.screenshot({ path: '/tmp/xhs-debug-1.png', fullPage: true });
    console.log('   已保存: /tmp/xhs-debug-1.png');

    // 检查页面内容
    console.log('\n4️⃣ 检查页面内容...');
    const pageTitle = await page.title();
    console.log(`   页面标题: ${pageTitle}`);

    // 查找所有图片
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map((img) => ({
        src: img.src?.substring(0, 100),
        width: img.width,
        height: img.height,
        className: img.className,
      }));
    });
    console.log(`   找到 ${images.length} 个图片:`);
    images.forEach((img, i) => {
      console.log(`     [${i}] ${img.width}x${img.height} class="${img.className}" src="${img.src}..."`);
    });

    // 查找可能的二维码容器
    console.log('\n5️⃣ 查找二维码相关元素...');
    const qrElements = await page.evaluate(() => {
      const selectors = [
        '.qrcode-img',
        '[class*="qrcode"]',
        '[class*="QRCode"]',
        '[class*="qr-code"]',
        'canvas',
      ];
      const results: string[] = [];
      selectors.forEach((sel) => {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          results.push(`${sel}: 找到 ${els.length} 个`);
        }
      });
      return results;
    });
    if (qrElements.length > 0) {
      qrElements.forEach((r) => console.log(`   ${r}`));
    } else {
      console.log('   未找到二维码相关元素');
    }

    // 检查是否有验证码或反爬虫页面
    console.log('\n6️⃣ 检查是否有验证码...');
    const hasVerify = await page.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes('验证') ||
        text.includes('滑块') ||
        text.includes('captcha') ||
        text.includes('verify')
      );
    });
    console.log(`   是否有验证码: ${hasVerify}`);

    // 再等待看看
    console.log('\n7️⃣ 再等待 5 秒...');
    await new Promise((r) => setTimeout(r, 5000));
    await page.screenshot({ path: '/tmp/xhs-debug-2.png', fullPage: true });
    console.log(`   当前URL: ${page.url()}`);
    console.log('   已保存: /tmp/xhs-debug-2.png');

  } catch (error) {
    console.error('\n❌ 错误:', error);
    await page.screenshot({ path: '/tmp/xhs-debug-error.png', fullPage: true });
    console.log('   错误截图已保存: /tmp/xhs-debug-error.png');
  } finally {
    await browser.close();
    console.log('\n✅ 完成');
  }
}

debugQRCode();
