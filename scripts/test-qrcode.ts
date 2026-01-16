/**
 * 测试二维码获取功能
 */
import { AuthService } from '../src/server/services/xhs/core/auth/auth.service';
import { defaultConfig } from '../src/server/services/xhs/shared/config';

async function testQRCode() {
  console.log('🔍 开始测试二维码获取...\n');

  const authService = new AuthService(defaultConfig);

  try {
    console.log('📱 正在获取二维码...');
    const startTime = Date.now();

    const result = await authService.getQRCode();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️  耗时: ${elapsed}s\n`);

    console.log('📊 结果:');
    console.log(`  - success: ${result.success}`);
    console.log(`  - message: ${result.message || '无'}`);

    if (result.qrCodeUrl) {
      // 只显示前100个字符
      const preview = result.qrCodeUrl.substring(0, 100);
      console.log(`  - qrCodeUrl: ${preview}...`);
      console.log(`  - qrCodeUrl 长度: ${result.qrCodeUrl.length} 字符`);

      // 如果是 base64 图片，保存到文件
      if (result.qrCodeUrl.startsWith('data:image')) {
        const fs = await import('fs');
        const base64Data = result.qrCodeUrl.replace(/^data:image\/\w+;base64,/, '');
        const outputPath = '/tmp/xhs-qrcode-test.png';
        fs.writeFileSync(outputPath, base64Data, 'base64');
        console.log(`\n✅ 二维码已保存到: ${outputPath}`);
        console.log('   可以用 open /tmp/xhs-qrcode-test.png 查看');
      }
    }

    if (!result.success) {
      console.log('\n❌ 获取二维码失败');
    } else if (result.message === 'already_logged_in') {
      console.log('\n✅ 已经登录，无需扫码');
    } else {
      console.log('\n✅ 二维码获取成功');
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
  } finally {
    // 清理
    await authService.cancelQRCodeSession();
    console.log('\n🧹 已清理会话');
    process.exit(0);
  }
}

testQRCode();
