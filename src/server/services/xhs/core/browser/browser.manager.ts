/**
 * Browser Manager for XHS Operations
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { join } from 'path';
import { Config, Cookie } from '../../shared/types';
import { BrowserLaunchError, BrowserNavigationError, XHSError } from '../../shared/errors';
import { getConfig } from '../../shared/config';
import { loadCookies, saveCookies } from '../../shared/cookies';
import { logger } from '../../shared/logger';
import { sleep } from '../../shared/utils';
import { BrowserPoolService, ManagedBrowser } from './browser-pool.service';
import { getUserDataPath } from '@/server/runtime/userDataPath';

export class BrowserManager {
  private config: Config;
  private browser: Browser | null = null;
  private browserPool: BrowserPoolService | null = null;
  private usePool: boolean = false;
  private launchPromise: Promise<Browser> | null = null;
  private browserLockPath: string | null = null;

  constructor(config?: Config, usePool: boolean = false) {
    this.config = config || getConfig();
    this.usePool = usePool;

    if (this.usePool) {
      this.browserPool = new BrowserPoolService(this.config);
    }
  }

  async createPage(
    headless?: boolean,
    executablePath?: string,
    shouldLoadCookies: boolean = true
  ): Promise<Page> {
    try {
      // Use browser pool if enabled
      if (this.usePool && this.browserPool) {
        return await this.createPageFromPool(shouldLoadCookies);
      }

      // Fallback to traditional browser management
      // Launch browser if not already launched (serialize concurrent calls)
      if (!this.browser) {
        this.browser = await this.getOrLaunchBrowser(headless, executablePath);
      }

      // Create new page
      const page = await this.browser.newPage();
      // Ensure a large viewport so critical buttons are visible without layout switching.
      await page.setViewport({ width: 1600, height: 1000 });

      // Configure page timeouts
      page.setDefaultTimeout(this.config.browser.defaultTimeout);
      page.setDefaultNavigationTimeout(this.config.browser.navigationTimeout);

      // Load cookies if requested
      if (shouldLoadCookies) {
        await this.loadCookiesIntoPage(page);
      }

      return page;
    } catch (error) {
      logger.error(`Browser page creation error: ${error}`);
      throw this.handlePuppeteerError(error as Error, 'create_page');
    }
  }

  /**
   * Create a page using the browser pool
   */
  private async createPageFromPool(shouldLoadCookies: boolean = true): Promise<Page> {
    if (!this.browserPool) {
      throw new XHSError('Browser pool not initialized', 'BrowserPoolError');
    }

    const managedBrowser = await this.browserPool.acquireBrowser();

    try {
      // Create new page from the managed browser context
      const page = await managedBrowser.context.newPage();

      // Configure page timeouts
      page.setDefaultTimeout(this.config.browser.defaultTimeout);
      page.setDefaultNavigationTimeout(this.config.browser.navigationTimeout);

      // Load cookies if requested
      if (shouldLoadCookies) {
        await this.loadCookiesIntoPage(page);
      }

      // Store reference to managed browser for cleanup
      (page as Page & { _managedBrowser?: ManagedBrowser })._managedBrowser = managedBrowser;

      // Set up page close handler to release browser back to pool
      page.once('close', async () => {
        try {
          await this.browserPool!.releaseBrowser(managedBrowser);
        } catch (error) {
          logger.warn(`Error releasing browser back to pool: ${error}`);
        }
      });

      return page;
    } catch (error) {
      // Release browser back to pool on error
      try {
        await this.browserPool.releaseBrowser(managedBrowser);
      } catch (releaseError) {
        logger.warn(`Error releasing browser after page creation failure: ${releaseError}`);
      }
      throw error;
    }
  }

  private async launchBrowser(headless?: boolean, executablePath?: string): Promise<Browser> {
    const isHeadless = headless !== undefined ? headless : this.config.browser.headlessDefault;
    const userDataDir = join(getUserDataPath(), 'browser-data');
    this.browserLockPath = join(userDataDir, 'xhs-browser.lock');

    // 清理所有可能的旧浏览器实例（包括使用旧路径的孤儿进程）
    try {
      await this.cleanupOrphanedBrowserProcesses();
    } catch (err) {
      logger.warn(`Failed to cleanup orphaned browser processes: ${err}`);
    }

    // 清理可能残留的 SingletonLock 文件（浏览器非正常关闭时会留下）
    try {
      const { existsSync, unlinkSync, readlinkSync } = require('fs');
      const lockFile = join(userDataDir, 'SingletonLock');
      if (existsSync(lockFile)) {
        // SingletonLock 是一个符号链接，指向 hostname-pid
        let shouldRemove = true;
        let orphanedPid: number | null = null;
        try {
          const linkTarget = readlinkSync(lockFile);
          // linkTarget 格式类似: hostname-12345
          const pidMatch = linkTarget.match(/-(\d+)$/);
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10);
            // 检查进程是否存活
            try {
              process.kill(pid, 0); // signal 0 只检查进程是否存在，不发送信号
              // 进程存活，检查是否是孤儿进程（父进程是 launchd/init）
              try {
                const { execSync } = require('child_process');
                const ppid = execSync(`ps -p ${pid} -o ppid=`, { encoding: 'utf8' }).trim();
                if (ppid === '1') {
                  // 父进程是 launchd，这是一个孤儿进程，应该被清理
                  orphanedPid = pid;
                  logger.info(`Found orphaned browser process ${pid} (parent is launchd), will terminate it`);
                  shouldRemove = true;
                } else {
                  // 进程存活且不是孤儿进程，不删除锁文件
                  shouldRemove = false;
                  logger.warn(`Browser process ${pid} still running, will attempt to reuse or wait`);
                }
              } catch (ppidError) {
                // 无法获取父进程 ID，保守处理：不删除锁文件
                shouldRemove = false;
                logger.debug(`Could not get parent PID for ${pid}: ${ppidError}`);
              }
            } catch {
              // 进程不存在，可以安全删除锁文件
              logger.info(`Stale lock file found (process ${pid} no longer exists), cleaning up`);
            }
          }
        } catch (readErr) {
          // 无法读取符号链接，可能是普通文件或损坏，尝试删除
          logger.debug(`Could not read lock file as symlink: ${readErr}`);
        }

        // 如果发现孤儿进程，先杀死它
        if (orphanedPid) {
          try {
            await this.terminateProcess(orphanedPid);
          } catch (killError) {
            logger.warn(`Failed to kill orphaned process ${orphanedPid}: ${killError}`);
          }
        }

        if (shouldRemove) {
          unlinkSync(lockFile);
          logger.info('Cleaned up stale SingletonLock file');
        }
      }
    } catch (err) {
      logger.debug(`Failed to cleanup SingletonLock: ${err}`);
    }

    // 进程级锁：防止多个实例同时使用同一份 profile
    try {
      await this.acquireBrowserLock();
    } catch (error) {
      throw new BrowserLaunchError(
        `Another instance is already using this browser profile. Please close other XHS Runner processes or remove the lock file at ${this.browserLockPath}.`,
        { headless: isHeadless, executablePath, userDataDir },
        error as Error
      );
    }

    try {
      const launchOptions: any = {
        headless: isHeadless,
        slowMo: this.config.browser.slowmo,
        // 持久化浏览器数据目录，避免被识别为新设备
        userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          // 隐藏自动化特征
          '--disable-blink-features=AutomationControlled',
          // Make the UI less likely to be hidden/overlapped (useful for publish flow)
          '--start-maximized',
          '--window-size=1600,1000',
        ],
      };

      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      const browser = await puppeteer.launch(launchOptions);
      return browser;
    } catch (error) {
      await this.releaseBrowserLock();
      logger.error(`Failed to launch browser: ${error}`);
      throw new BrowserLaunchError(
        `Failed to launch browser: ${error}`,
        { headless: isHeadless, executablePath },
        error as Error
      );
    }
  }

  private async loadCookiesIntoPage(page: Page): Promise<boolean> {
    try {
      const cookies = loadCookies();

      if (!cookies) {
        return false;
      }

      // Convert our cookie format to Puppeteer format
      const puppeteerCookies = cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
      }));

      await page.setCookie(...puppeteerCookies);
      return true;
    } catch (error) {
      logger.warn(`Failed to load cookies: ${error}`);
      return false;
    }
  }

  async saveCookiesFromPage(page: Page): Promise<void> {
    try {
      const cookies = await page.cookies();

      // Convert Puppeteer cookie format to app format
      const appCookies: Cookie[] = cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite as 'Strict' | 'Lax' | 'None',
      }));

      saveCookies(appCookies);
    } catch (error) {
      logger.error(`Failed to save cookies: ${error}`);
      throw this.handlePuppeteerError(error as Error, 'save_cookies');
    }
  }

  async navigateWithRetry(
    page: Page,
    url: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' = 'load',
    maxRetries?: number
  ): Promise<void> {
    const retries = maxRetries || this.config.xhs.maxRetries;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await page.goto(url, {
          waitUntil,
          timeout: this.config.browser.navigationTimeout,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          if (attempt === retries) {
            throw new BrowserNavigationError(
              `Failed to navigate to ${url} after ${retries + 1} attempts`,
              { url, attempts: attempt + 1 },
              error
            );
          }

          await sleep(this.config.xhs.retryDelay * 1000);
        } else {
          throw error;
        }
      }
    }
  }

  async tryWaitForSelector(
    page: Page,
    selector: string,
    timeout?: number,
    visible: boolean = true
  ): Promise<boolean> {
    try {
      await page.waitForSelector(selector, {
        timeout: timeout || this.config.browser.defaultTimeout,
        visible,
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return false;
      }
      throw error;
    }
  }

  async waitForSelectorVisible(page: Page, selector: string, timeout?: number): Promise<boolean> {
    return this.tryWaitForSelector(page, selector, timeout, true);
  }

  async waitForSelectorHidden(page: Page, selector: string, timeout?: number): Promise<boolean> {
    return this.tryWaitForSelector(page, selector, timeout, false);
  }

  async cleanup(): Promise<void> {
    // Cleanup browser pool if using it
    if (this.usePool && this.browserPool) {
      try {
        await this.browserPool.cleanup();
      } catch (error) {
        logger.warn(`Error cleaning up browser pool: ${error}`);
      } finally {
        this.browserPool = null;
      }
    }

    // Cleanup traditional browser instance
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.warn(`Error closing browser: ${error}`);
      } finally {
        this.browser = null;
      }
    }

    await this.releaseBrowserLock();
  }

  /**
   * Get browser pool statistics (if using pool)
   */
  getBrowserPoolStats() {
    if (this.usePool && this.browserPool) {
      return this.browserPool.getPoolStats();
    }
    return null;
  }

  /**
   * Enable browser pooling
   */
  enableBrowserPool(): void {
    if (!this.usePool) {
      this.usePool = true;
      this.browserPool = new BrowserPoolService(this.config);
    }
  }

  /**
   * Disable browser pooling
   */
  async disableBrowserPool(): Promise<void> {
    if (this.usePool && this.browserPool) {
      await this.browserPool.cleanup();
      this.browserPool = null;
      this.usePool = false;
    }
  }

  private async getOrLaunchBrowser(headless?: boolean, executablePath?: string): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }
    if (this.launchPromise) {
      return this.launchPromise;
    }
    this.launchPromise = this.launchBrowser(headless, executablePath).finally(() => {
      this.launchPromise = null;
    });
    return this.launchPromise;
  }

  private async acquireBrowserLock(): Promise<void> {
    if (!this.browserLockPath) {
      return;
    }
    const { writeFileSync, readFileSync, existsSync, unlinkSync } = require('fs');
    const lockPath = this.browserLockPath;
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      return;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }

    if (!existsSync(lockPath)) {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      return;
    }

    const rawPid = readFileSync(lockPath, 'utf8').trim();
    const pid = parseInt(rawPid, 10);
    if (pid === process.pid) {
      return;
    }
    if (!Number.isNaN(pid)) {
      try {
        process.kill(pid, 0);
        throw new Error(`Browser lock is held by pid ${pid}`);
      } catch (err: any) {
        if (err?.code !== 'ESRCH') {
          throw err;
        }
      }
    }
    try {
      unlinkSync(lockPath);
    } catch {
      // ignore cleanup failure
    }
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  }

  private async releaseBrowserLock(): Promise<void> {
    if (!this.browserLockPath) {
      return;
    }
    const { existsSync, readFileSync, unlinkSync } = require('fs');
    if (!existsSync(this.browserLockPath)) {
      return;
    }
    try {
      const rawPid = readFileSync(this.browserLockPath, 'utf8').trim();
      const pid = parseInt(rawPid, 10);
      if (pid === process.pid || Number.isNaN(pid)) {
        unlinkSync(this.browserLockPath);
      }
    } catch {
      // ignore cleanup failure
    }
  }

  /**
   * 清理所有孤儿浏览器进程
   * 检查所有 Chrome 进程，如果使用了 xhs 相关的 user-data-dir 且父进程是 launchd，则清理
   */
  private async cleanupOrphanedBrowserProcesses(): Promise<void> {
    try {
      const { execSync } = require('child_process');
      const { homedir } = require('os');

      // 获取所有可能的 xhs 浏览器数据目录路径
      const possibleDataDirs = [
        join(homedir(), '.xhs-runner', 'browser-data'),
        join(homedir(), 'Library', 'Application Support', 'xhs-generator', 'browser-data'),
        join(homedir(), 'Library', 'Application Support', 'xhs-runner', 'browser-data'),
      ];

      // 查找所有使用这些目录的 Chrome 进程
      const psList = execSync(
        'ps aux | grep -i "chrome.*user-data-dir" | grep -v grep',
        { encoding: 'utf8' }
      );

      const lines = psList.split('\n').filter(Boolean);
      const orphanedPids: number[] = [];

      for (const line of lines) {
        // 检查是否使用了我们的数据目录
        const usesOurDir = possibleDataDirs.some(dir => line.includes(dir));
        if (!usesOurDir) continue;

        // 提取 PID
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid)) continue;

        // 检查父进程是否是 launchd (ppid=1)
        try {
          const ppid = execSync(`ps -p ${pid} -o ppid=`, { encoding: 'utf8' }).trim();
          if (ppid === '1') {
            orphanedPids.push(pid);
            logger.info(`Found orphaned XHS browser process: ${pid}`);
          }
        } catch {
          // 进程可能已经不存在了
        }
      }

      // 终止所有孤儿进程
      for (const pid of orphanedPids) {
        try {
          await this.terminateProcess(pid);
        } catch (err) {
          logger.warn(`Failed to terminate orphaned process ${pid}: ${err}`);
        }
      }

      if (orphanedPids.length > 0) {
        logger.info(`Cleaned up ${orphanedPids.length} orphaned browser process(es)`);
        // 给系统一点时间完全清理
        await sleep(1000);
      }
    } catch (err) {
      // 如果 ps/grep 命令失败（比如没有找到进程），这是正常的
      logger.debug(`cleanupOrphanedBrowserProcesses: ${err}`);
    }
  }

  /**
   * 终止指定的进程（先 SIGTERM，如果不退出则 SIGKILL）
   */
  private async terminateProcess(pid: number): Promise<void> {
    logger.info(`Terminating process ${pid}...`);

    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      // 进程可能已经不存在
      return;
    }

    // 等待进程退出（最多 5 秒）
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      try {
        process.kill(pid, 0);
        // 进程还在，继续等待
      } catch {
        // 进程已退出
        logger.info(`Process ${pid} terminated successfully`);
        return;
      }
    }

    // 如果进程还在，强制杀死
    try {
      process.kill(pid, 0);
      logger.warn(`Process ${pid} still alive after 5s, force killing...`);
      process.kill(pid, 'SIGKILL');
      await sleep(500);
      logger.info(`Process ${pid} force killed`);
    } catch {
      // 进程已退出
    }
  }

  private handlePuppeteerError(error: Error, operationName: string): XHSError {
    const context = { operationName };

    if (error.name === 'TimeoutError') {
      if (operationName.toLowerCase().includes('login')) {
        return new XHSError(
          `Login operation timed out during ${operationName}`,
          'LoginTimeoutError',
          context,
          error
        );
      } else {
        return new XHSError(
          `Browser operation timed out: ${operationName}`,
          'BrowserError',
          context,
          error
        );
      }
    } else {
      if (error.message.toLowerCase().includes('navigation')) {
        return new BrowserNavigationError(
          `Navigation failed during ${operationName}: ${error.message}`,
          context,
          error
        );
      } else {
        return new XHSError(
          `Browser error during ${operationName}: ${error.message}`,
          'BrowserError',
          context,
          error
        );
      }
    }
  }
}

// Global browser manager instance
let globalBrowserManager: BrowserManager | null = null;

export function getBrowserManager(usePool: boolean = false): BrowserManager {
  if (!globalBrowserManager) {
    globalBrowserManager = new BrowserManager(undefined, usePool);
  }
  return globalBrowserManager;
}

export function getPooledBrowserManager(): BrowserManager {
  return getBrowserManager(true);
}

export async function cleanupGlobalBrowserManager(): Promise<void> {
  if (globalBrowserManager) {
    await globalBrowserManager.cleanup();
    globalBrowserManager = null;
  }
}
