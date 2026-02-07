/**
 * Base service class for XHS MCP Server services
 */

import { Config } from './types';
import { BrowserManager, getBrowserManager as getGlobalBrowserManager } from '../core/browser/browser.manager';

/**
 * Base service class that provides common functionality for all services
 *
 * 重要：使用全局共享的 BrowserManager 实例，避免多个 Service 创建独立的
 * 浏览器实例导致 SingletonLock 冲突。
 */
export abstract class BaseService {
  protected readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Get the browser manager instance (全局共享)
   *
   * 所有 Service 共享同一个 BrowserManager，这样：
   * 1. 避免多个浏览器实例争用同一个 userDataDir
   * 2. 浏览器实例可以被复用，提高性能
   */
  protected getBrowserManager(): BrowserManager {
    return getGlobalBrowserManager();
  }

  /**
   * Get the configuration
   */
  protected getConfig(): Config {
    return this.config;
  }
}
