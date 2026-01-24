/**
 * Authentication service for XHS MCP Server
 */

import { Page } from 'puppeteer';
import { Config, LoginResult, StatusResult } from '../../shared/types';
import {
  LoginTimeoutError,
  LoginFailedError,
  NotLoggedInError,
  XHSError,
} from '../../shared/errors';
import { BaseService } from '../../shared/base.service';
import { deleteCookiesFile, getCookiesInfo, saveCookies } from '../../shared/cookies';
import { isLoggedIn, getLoginStatusWithProfile } from '../../shared/xhs.utils';
import { logger } from '../../shared/logger';
import { sleep } from '../../shared/utils';

export interface QRCodeResult {
  success: boolean;
  qrCodeUrl?: string;
  message?: string;
}

export interface PollResult {
  success: boolean;
  loggedIn: boolean;
  message?: string;
  profile?: any;
  qrCodeUrl?: string; // 如果二维码刷新了，返回新的二维码
  qrCodeRefreshed?: boolean;
  verificationRound?: number; // 当前是第几轮验证（1=首次，2=二次验证，3=三次验证...）
}

export class AuthService extends BaseService {
  private qrCodePage: Page | null = null;
  private qrCodeSessionActive: boolean = false;
  private lastQRCodeHash: string | null = null; // 用于检测二维码变化
  private verificationRound: number = 1; // 当前验证轮次

  constructor(config: Config) {
    super(config);
  }

  /**
   * 获取登录二维码（不弹出浏览器窗口）
   */
  async getQRCode(browserPath?: string): Promise<QRCodeResult> {
    try {
      // 如果已有会话，先关闭
      if (this.qrCodePage) {
        try {
          await this.qrCodePage.close();
        } catch {}
        this.qrCodePage = null;
      }

      // 创建 headless 浏览器页面（不加载 cookies，因为要登录）
      const page = await this.getBrowserManager().createPage(true, browserPath, false);
      this.qrCodePage = page;
      this.qrCodeSessionActive = true;
      this.verificationRound = 1; // 重置验证轮次

      // 设置 User-Agent 避免被检测
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // 直接导航到小红书登录页面
      logger.info('正在导航到小红书登录页面...');
      await page.goto('https://www.xiaohongshu.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(2000);

      // 检查是否已登录（会自动跳转）
      const currentUrl = page.url();
      if (!currentUrl.includes('/login')) {
        // 已登录，跳转到了其他页面
        await page.close();
        this.qrCodePage = null;
        this.qrCodeSessionActive = false;
        return {
          success: true,
          message: 'already_logged_in',
        };
      }

      // 等待二维码出现 - 直接使用已知有效的选择器
      logger.info('等待二维码加载...');
      let qrCodeElement = null;

      try {
        // 小红书登录页面的二维码选择器
        await page.waitForSelector('.qrcode-img', { timeout: 10000 });
        qrCodeElement = await page.$('.qrcode-img');
        if (qrCodeElement) {
          logger.info('找到二维码元素: .qrcode-img');
        }
      } catch {
        logger.info('.qrcode-img 未找到，尝试其他选择器...');
      }

      // 备用选择器
      if (!qrCodeElement) {
        const backupSelectors = [
          'img[class*="qrcode"]',
          '[class*="qrcode"] img',
          'img[src*="qrcode"]',
        ];
        for (const selector of backupSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            qrCodeElement = await page.$(selector);
            if (qrCodeElement) {
              logger.info(`找到二维码元素: ${selector}`);
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!qrCodeElement) {
        // 截图整个页面用于调试
        const debugScreenshot = await page.screenshot({ encoding: 'base64' });
        logger.error('无法找到二维码元素，页面截图已保存');
        logger.info(`当前页面URL: ${page.url()}`);

        // 返回整个页面截图作为调试信息
        return {
          success: false,
          message: '无法找到二维码元素，请检查页面结构',
          qrCodeUrl: `data:image/png;base64,${debugScreenshot}`,
        };
      }

      // 获取二维码图片的 base64
      const qrCodeBase64 = await qrCodeElement.screenshot({ encoding: 'base64' });
      logger.info('二维码截图成功');

      return {
        success: true,
        qrCodeUrl: `data:image/png;base64,${qrCodeBase64}`,
      };
    } catch (error) {
      logger.error(`获取二维码失败: ${error}`);
      // 清理
      if (this.qrCodePage) {
        try {
          await this.qrCodePage.close();
        } catch {}
        this.qrCodePage = null;
      }
      this.qrCodeSessionActive = false;
      return {
        success: false,
        message: error instanceof Error ? error.message : '获取二维码失败',
      };
    }
  }

  /**
   * 轮询检测登录状态（配合 getQRCode 使用）
   * 同时检测二维码是否刷新，如果刷新则返回新的二维码
   */
  async pollLoginStatus(): Promise<PollResult> {
    try {
      if (!this.qrCodePage || !this.qrCodeSessionActive) {
        return {
          success: false,
          loggedIn: false,
          message: 'no_active_session',
        };
      }

      const page = this.qrCodePage;

      // 检查是否已登录
      const loggedIn = await isLoggedIn(page);

      if (loggedIn) {
        // 保存 cookies
        await this.getBrowserManager().saveCookiesFromPage(page);

        // 获取用户信息
        let profile: any = undefined;
        try {
          const loginStatus = await getLoginStatusWithProfile(page);
          profile = loginStatus.profile;

          // 尝试获取 userId
          const profileUrl = await page.evaluate(() => {
            const userLinks = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'));
            const currentUserLink = userLinks.find((link) => {
              const text = link.textContent?.trim();
              return text === '我' || (text && text.includes('profile'));
            });
            return currentUserLink ? (currentUserLink as HTMLAnchorElement).href : null;
          });

          if (profileUrl) {
            const userIdMatch = profileUrl.match(/\/user\/profile\/([a-f0-9]+)/);
            if (userIdMatch) {
              profile = { ...profile, userId: userIdMatch[1], profileUrl };
            }
          }
        } catch (e) {
          logger.warn('获取用户信息失败:', e);
        }

        // 关闭页面
        await page.close();
        this.qrCodePage = null;
        this.qrCodeSessionActive = false;
        this.lastQRCodeHash = null;

        return {
          success: true,
          loggedIn: true,
          message: '登录成功',
          profile,
        };
      }

      // 检测二维码是否刷新（小红书扫码后可能会刷新二维码，进入二次/三次验证）
      let qrCodeRefreshed = false;
      let newQRCodeUrl: string | undefined;

      try {
        // 使用多个选择器尝试找到二维码，按优先级排序
        // 二次验证页面的二维码可能使用不同的选择器
        const qrCodeSelectors = [
          // 二次验证页面的二维码选择器（优先级最高）
          '.verify-qrcode img',
          '.qrcode-container img',
          '[class*="verify"] img[src*="qrcode"]',
          '[class*="verify"] .qrcode-img',
          // 标准登录页面的二维码选择器
          '.qrcode-img',
          'img[class*="qrcode"]',
          '[class*="qrcode"] img',
          'img[src*="qrcode"]',
          // 通用二维码选择器（排除头像等小图片）
          'img[width="200"]',
          'img[height="200"]',
        ];

        let qrCodeElement = null;
        let usedSelector = '';

        for (const selector of qrCodeSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              // 验证这是一个合理大小的二维码（排除头像等小图片）
              const box = await element.boundingBox();
              if (box && box.width >= 100 && box.height >= 100) {
                qrCodeElement = element;
                usedSelector = selector;
                break;
              }
            }
          } catch {
            continue;
          }
        }

        if (qrCodeElement) {
          const qrCodeBase64 = await qrCodeElement.screenshot({ encoding: 'base64' });
          // 简单的 hash 检测：使用 base64 前100个字符作为指纹
          const currentHash = qrCodeBase64.substring(0, 100);

          if (this.lastQRCodeHash && this.lastQRCodeHash !== currentHash) {
            // 二维码已刷新，可能进入了下一轮验证
            qrCodeRefreshed = true;
            this.verificationRound++;
            newQRCodeUrl = `data:image/png;base64,${qrCodeBase64}`;
            logger.info(`检测到二维码已刷新（第 ${this.verificationRound} 轮验证），选择器: ${usedSelector}`);
          }
          this.lastQRCodeHash = currentHash;
        } else {
          logger.warn('未找到二维码元素，可能页面结构已变化');
        }
      } catch (e) {
        logger.warn('检测二维码刷新失败:', e);
      }

      return {
        success: true,
        loggedIn: false,
        message: this.verificationRound > 1 ? `第 ${this.verificationRound} 轮验证中` : 'waiting',
        qrCodeRefreshed,
        qrCodeUrl: newQRCodeUrl,
        verificationRound: this.verificationRound,
      };
    } catch (error) {
      logger.error(`轮询登录状态失败: ${error}`);
      return {
        success: false,
        loggedIn: false,
        message: error instanceof Error ? error.message : '检测失败',
      };
    }
  }

  /**
   * 取消二维码登录会话
   */
  async cancelQRCodeSession(): Promise<void> {
    if (this.qrCodePage) {
      try {
        await this.qrCodePage.close();
      } catch {}
      this.qrCodePage = null;
    }
    this.qrCodeSessionActive = false;
  }

  async login(browserPath?: string, timeout: number = 300): Promise<LoginResult> {
    try {
      const page = await this.getBrowserManager().createPage(false, browserPath, true);

      try {
        // Navigate to explore page
        await this.getBrowserManager().navigateWithRetry(page, this.getConfig().xhs.exploreUrl);

        // Check if already logged in
        if (await isLoggedIn(page)) {
          // Get profile information if already logged in
          let profile: any = undefined;
          try {
            // Find current user's profile link and extract user ID from URL
            const profileUrl = await page.evaluate(() => {
              const userLinks = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'));
              const currentUserLink = userLinks.find((link) => {
                const text = link.textContent?.trim();
                return (
                  text === '我' ||
                  (text && text.includes('profile')) ||
                  (text && text.includes('用户'))
                );
              });
              return currentUserLink ? (currentUserLink as HTMLAnchorElement).href : null;
            });

            if (profileUrl) {
              // Extract user ID from profile URL
              const userIdMatch = profileUrl.match(/\/user\/profile\/([a-f0-9]+)/);
              if (userIdMatch) {
                profile = {
                  userId: userIdMatch[1],
                  profileUrl: profileUrl,
                };
              }
            }

            // Also try to get additional profile info from current page
            const loginStatus = await getLoginStatusWithProfile(page);
            if (loginStatus.profile) {
              profile = { ...profile, ...loginStatus.profile };
            }
          } catch (profileError) {
            logger.warn('Failed to get profile information:', profileError);
            // Continue without profile info
          }

          return {
            success: true,
            message: 'Already logged in',
            status: 'logged_in',
            action: 'none',
            profile,
          };
        }

        // Wait for login completion
        const checkInterval = 5; // Check every 5 seconds
        const maxChecks = timeout / checkInterval;

        for (let checkCount = 0; checkCount < maxChecks; checkCount++) {
          try {
            // Check if login completed with short timeout
            await page.waitForSelector(this.getConfig().xhs.loginOkSelector, {
              timeout: checkInterval * 1000,
            });
            // Login completed successfully
            break;
          } catch (error) {
            // Login not yet complete, continue checking
            const elapsed = (checkCount + 1) * checkInterval;
            const remaining = timeout - elapsed;

            if (checkCount === maxChecks - 1) {
              // Final timeout reached
              throw new LoginTimeoutError(
                `Login timed out after ${timeout} seconds. Please complete QR code scanning or manual login in the browser window.`,
                {
                  timeout,
                  url: this.getConfig().xhs.exploreUrl,
                  elapsedTime: elapsed,
                  suggestion: 'Increase timeout parameter or complete login faster',
                }
              );
            }
          }
        }

        // Save cookies after successful login
        await this.getBrowserManager().saveCookiesFromPage(page);

        // Verify login success and get profile information
        await sleep(1000); // Brief wait for page to update
        const loginStatus = await getLoginStatusWithProfile(page);
        if (loginStatus.isLoggedIn) {
          // Try to get additional profile information
          let profile = loginStatus.profile;
          try {
            // Find current user's profile link and extract user ID from URL
            const profileUrl = await page.evaluate(() => {
              const userLinks = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'));
              const currentUserLink = userLinks.find((link) => {
                const text = link.textContent?.trim();
                return (
                  text === '我' ||
                  (text && text.includes('profile')) ||
                  (text && text.includes('用户'))
                );
              });
              return currentUserLink ? (currentUserLink as HTMLAnchorElement).href : null;
            });

            if (profileUrl) {
              // Extract user ID from profile URL
              const userIdMatch = profileUrl.match(/\/user\/profile\/([a-f0-9]+)/);
              if (userIdMatch) {
                profile = {
                  ...profile,
                  userId: userIdMatch[1],
                  profileUrl: profileUrl,
                };
              }
            }
          } catch (profileError) {
            logger.warn('Failed to get additional profile information:', profileError);
            // Continue with existing profile info
          }

          return {
            success: true,
            message: 'Login successful',
            status: 'logged_in',
            action: 'logged_in',
            profile,
          };
        } else {
          throw new LoginFailedError(
            'Login process completed but authentication verification failed'
          );
        }
      } finally {
        await page.close();
      }
    } catch (error) {
      if (error instanceof LoginTimeoutError || error instanceof LoginFailedError) {
        throw error;
      }
      logger.error(`Login failed with unexpected error: ${error}`);
      throw new XHSError(`Login failed: ${error}`, 'LoginError', { timeout }, error as Error);
    }
  }

  async logout(): Promise<LoginResult> {
    try {
      const success = deleteCookiesFile();

      if (success) {
        return {
          success: true,
          message: 'Logged out successfully (cookies deleted)',
          status: 'logged_out',
          action: 'logged_out',
        };
      } else {
        return {
          success: false,
          message: 'Failed to delete cookies file',
          status: 'logged_out',
          action: 'none',
        };
      }
    } catch (error) {
      logger.error(`Logout failed: ${error}`);
      return {
        success: false,
        message: `Logout failed: ${error}`,
        status: 'logged_out',
        action: 'none',
      };
    }
  }

  async checkStatus(browserPath?: string): Promise<StatusResult> {
    try {
      const page = await this.getBrowserManager().createPage(true, browserPath, true);

      try {
        await this.getBrowserManager().navigateWithRetry(page, this.getConfig().xhs.exploreUrl);
        await sleep(1000); // Wait for page to load

        // First check if logged in
        const loggedIn = await isLoggedIn(page);

        if (!loggedIn) {
          return {
            success: true,
            loggedIn: false,
            status: 'logged_out',
            urlChecked: this.getConfig().xhs.exploreUrl,
          };
        }

        // If logged in, try to get profile information
        let profile: any = undefined;
        try {
          // Find current user's profile link and extract user ID from URL
          const profileUrl = await page.evaluate(() => {
            const userLinks = Array.from(document.querySelectorAll('a[href*="/user/profile/"]'));
            const currentUserLink = userLinks.find((link) => {
              const text = link.textContent?.trim();
              return (
                text === '我' ||
                (text && text.includes('profile')) ||
                (text && text.includes('用户'))
              );
            });
            return currentUserLink ? (currentUserLink as HTMLAnchorElement).href : null;
          });

          if (profileUrl) {
            // Extract user ID from profile URL
            const userIdMatch = profileUrl.match(/\/user\/profile\/([a-f0-9]+)/);
            if (userIdMatch) {
              profile = {
                userId: userIdMatch[1],
                profileUrl: profileUrl,
              };
            }
          }
        } catch (profileError) {
          console.error('❌ Failed to get profile information:', profileError);
          // Continue without profile info
        }

        return {
          success: true,
          loggedIn: true,
          status: 'logged_in',
          urlChecked: this.getConfig().xhs.exploreUrl,
          profile,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      logger.error(`Status check failed: ${error}`);
      throw new XHSError(`Status check failed: ${error}`, 'StatusCheckError', {}, error as Error);
    }
  }

  /**
   * 从 Cookie 字符串导入登录状态
   * 支持两种格式：
   * 1. 浏览器 Cookie 字符串格式: "name1=value1; name2=value2"
   * 2. JSON 数组格式: [{"name": "xxx", "value": "xxx", "domain": ".xiaohongshu.com"}]
   */
  async importCookies(cookieString: string): Promise<LoginResult> {
    try {
      let cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];

      const trimmed = cookieString.trim();

      // 尝试解析为 JSON
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            cookies = parsed.map((c: any) => ({
              name: c.name,
              value: c.value,
              domain: c.domain || '.xiaohongshu.com',
              path: c.path || '/',
            }));
          }
        } catch {
          throw new Error('JSON 格式解析失败');
        }
      } else {
        // 解析浏览器 Cookie 字符串格式: "name1=value1; name2=value2"
        const pairs = trimmed.split(';').map((p) => p.trim()).filter(Boolean);
        for (const pair of pairs) {
          const eqIndex = pair.indexOf('=');
          if (eqIndex > 0) {
            const name = pair.substring(0, eqIndex).trim();
            const value = pair.substring(eqIndex + 1).trim();
            if (name && value) {
              cookies.push({
                name,
                value,
                domain: '.xiaohongshu.com',
                path: '/',
              });
            }
          }
        }
      }

      if (cookies.length === 0) {
        return {
          success: false,
          message: 'Cookie 解析失败，请检查格式',
          status: 'logged_out',
          action: 'none',
        };
      }

      // 检查必要的 cookie
      const requiredCookies = ['web_session'];
      const cookieNames = cookies.map((c) => c.name);
      const missingCookies = requiredCookies.filter((name) => !cookieNames.includes(name));

      if (missingCookies.length > 0) {
        logger.warn(`缺少关键 Cookie: ${missingCookies.join(', ')}`);
        // 不阻止导入，只是警告
      }

      // 保存 cookies
      saveCookies(cookies);
      logger.info(`成功导入 ${cookies.length} 个 Cookie`);

      // 验证登录状态
      try {
        const status = await this.checkStatus();
        if (status.loggedIn) {
          return {
            success: true,
            message: `成功导入 ${cookies.length} 个 Cookie，登录验证通过`,
            status: 'logged_in',
            action: 'logged_in',
            profile: status.profile,
          };
        } else {
          return {
            success: true,
            message: `已导入 ${cookies.length} 个 Cookie，但登录验证未通过，Cookie 可能已过期`,
            status: 'logged_out',
            action: 'none',
          };
        }
      } catch (e) {
        return {
          success: true,
          message: `已导入 ${cookies.length} 个 Cookie，验证时出错: ${e}`,
          status: 'logged_out',
          action: 'none',
        };
      }
    } catch (error) {
      logger.error(`Cookie 导入失败: ${error}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Cookie 导入失败',
        status: 'logged_out',
        action: 'none',
      };
    }
  }
}
