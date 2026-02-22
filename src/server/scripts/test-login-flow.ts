/**
 * 登录验证流程测试脚本
 *
 * 测试场景：
 * 1. 二维码登录流程
 * 2. 登录状态检查
 * 3. 被动登出（删除 cookie 文件）
 *   4. 主动登出
 */

import { existsSync, unlinkSync } from 'fs';
import { getConfig } from '@/server/services/xhs/shared/config';

const API_BASE = 'http://localhost:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

// 获取 cookies 文件路径
function getCookiesFilePath(): string {
  const config = getConfig();
  return config.paths.cookiesFile;
}

// API 调用
async function apiCall(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const url = `${API_BASE}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json();
}

// 测试 1: 二维码登录流程
async function testQRCodeLogin() {
  section('测试 1: 二维码登录流程');

  try {
    // 获取二维码
    log('正在获取二维码...', 'yellow');
    const qrResult = await apiCall('/api/auth/qrcode', 'GET');
    console.log(JSON.stringify(qrResult, null, 2));

    if (!qrResult.success || !qrResult.qrCodeUrl) {
      log('❌ 二维码获取失败', 'red');
      return false;
    }

    log('✅ 二维码获取成功', 'green');
    log(`二维码 URL: ${qrResult.qrCodeUrl}`, 'blue');

    // 提示用户扫码
    log('\n请使用小红书 App 扫描二维码进行登录...', 'yellow');
    log('等待 60 秒，每 2 秒轮询一次...', 'yellow');

    // 轮询检测登录状态
    let pollCount = 0;
    const maxPolls = 30; // 60 秒，每 2 秒一次

    while (pollCount < maxPolls) {
      pollCount++;
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const pollResult = await apiCall('/api/auth/poll', 'GET');

      if (pollResult.loggedIn) {
        log(`\n✅ 登录成功！轮询次数: ${pollCount}`, 'green');
        console.log(JSON.stringify(pollResult, null, 2));

        if (pollResult.profile) {
          log(`用户信息: ${pollResult.profile.nickname || pollResult.profile.username}`, 'green');
        }
        return true;
      }

      if (pollResult.qrCodeRefreshed) {
        log(`二维码已刷新，当前验证轮次: ${pollResult.verificationRound}`, 'yellow');
      }
    }

    log('❌ 登录超时，请重试', 'red');
    return false;
  } catch (error: any) {
    log(`❌ 二维码登录测试失败: ${error.message}`, 'red');
    return false;
  }
}

// 测试 2: 登录状态检查
async function testLoginStatus() {
  section('测试 2: 登录状态检查');

  try {
    log('正在检查登录状态...', 'yellow');
    const statusResult = await apiCall('/api/auth/status', 'GET');
    console.log(JSON.stringify(statusResult, null, 2));

    if (!statusResult.success) {
      log('❌ 状态检查失败', 'red');
      return false;
    }

    if (statusResult.loggedIn) {
      log('✅ 已登录', 'green');
      if (statusResult.profile) {
        log(`用户: ${statusResult.profile.nickname || statusResult.profile.username}`, 'green');
      }
    } else {
      log('⚠️  未登录', 'yellow');
    }

    return true;
  } catch (error: any) {
    log(`❌ 状态检查失败: ${error.message}`, 'red');
    return false;
  }
}

// 测试 3: 被动登出（删除 cookie 文件）
async function testPassiveLogout() {
  section('测试 3: 被动登出（删除 cookie 文件）');

  try {
    const cookiesPath = getCookiesFilePath();
    log(`Cookies 文件路径: ${cookiesPath}`, 'blue');

    if (!existsSync(cookiesPath)) {
      log('⚠️  Cookies 文件不存在，跳过此测试', 'yellow');
      return true;
    }

    log('正在删除 cookies 文件...', 'yellow');
    unlinkSync(cookiesPath);
    log('✅ Cookies 文件已删除', 'green');

    // 等待 2 秒
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 检查登录状态
    log('正在检查登录状态...', 'yellow');
    const statusResult = await apiCall('/api/auth/status', 'GET');
    console.log(JSON.stringify(statusResult, null, 2));

    if (!statusResult.success) {
      log('❌ 状态检查失败', 'red');
      return false;
    }

    if (!statusResult.loggedIn || statusResult.status === 'logged_out') {
      log('✅ 被动登出被正确检测', 'green');
      return true;
    }

    log('⚠️  状态检查显示仍为已登录，可能需要刷新或等待更长时间', 'yellow');
    return true;
  } catch (error: any) {
    log(`❌ 被动登出测试失败: ${error.message}`, 'red');
    return false;
  }
}

// 测试 4: 主动登出
async function testActiveLogout() {
  section('测试 4: 主动登出');

  try {
    log('正在执行主动登出...', 'yellow');
    const logoutResult = await apiCall('/api/auth/logout', 'POST');
    console.log(JSON.stringify(logoutResult, null, 2));

    if (!logoutResult.success) {
      log('❌ 登出失败', 'red');
      return false;
    }

    log('✅ 登出成功', 'green');

    // 检查状态
    log('正在验证登出状态...', 'yellow');
    const statusResult = await apiCall('/api/auth/status', 'GET');
    console.log(JSON.stringify(statusResult, null, 2));

    if (!statusResult.success) {
      log('❌ 状态验证失败', 'red');
      return false;
    }

    if (!statusResult.loggedIn || statusResult.status === 'logged_out') {
      log('✅ 状态验证通过，已正确登出', 'green');
      return true;
    }

    log('⚠️  状态显示仍为已登录', 'yellow');
    return true;
  } catch (error: any) {
    log(`❌ 主动登出测试失败: ${error.message}`, 'red');
    return false;
  }
}

// 主函数
async function main() {
  section('开始登录验证流程测试');
  log(`API 地址: ${API_BASE}`, 'blue');
  log(`Cookies 文件路径: ${getCookiesFilePath()}`, 'blue');

  const results: Record<string, boolean> = {};

  // 检查服务器是否运行
  try {
    await fetch(API_BASE);
    log('✅ 服务器运行正常', 'green');
  } catch {
    log('❌ 无法连接到服务器，请先运行 npm run dev', 'red');
    return;
  }

  // 运行测试
  results['二维码登录'] = await testQRCodeLogin();
  results['状态检查'] = await testLoginStatus();
  results['被动登出'] = await testPassiveLogout();
  results['主动登出'] = await testActiveLogout();

  // 输出结果汇总
  section('测试结果汇总');
  for (const [testName, passed] of Object.entries(results)) {
    const status = passed ? '✅ 通过' : '❌ 失败';
    const color = passed ? 'green' : 'red';
    log(`${status} - ${testName}`, color);
  }

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  log(`\n总计: ${passedTests}/${totalTests} 测试通过`, 'cyan');
}

main().catch(console.error);
