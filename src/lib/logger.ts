/**
 * Structured Logger for XHS Generator
 *
 * Provides structured logging with different log levels and context support.
 * Useful for debugging agent workflows and tracking streaming events.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
}

class Logger {
  private minLevel: LogLevel;
  private enableConsole: boolean;
  private logs: LogEntry[] = [];

  constructor(minLevel: LogLevel = LogLevel.INFO, enableConsole: boolean = true) {
    this.minLevel = minLevel;
    this.enableConsole = enableConsole;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };

    this.logs.push(entry);

    if (this.enableConsole) {
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';
      const errorStr = error ? ` ${error.stack || error.message}` : '';

      switch (level) {
        case LogLevel.DEBUG:
          console.debug(`[${entry.timestamp}] DEBUG: ${message}${contextStr}${errorStr}`);
          break;
        case LogLevel.INFO:
          console.info(`[${entry.timestamp}] INFO: ${message}${contextStr}${errorStr}`);
          break;
        case LogLevel.WARN:
          console.warn(`[${entry.timestamp}] WARN: ${message}${contextStr}${errorStr}`);
          break;
        case LogLevel.ERROR:
          console.error(`[${entry.timestamp}] ERROR: ${message}${contextStr}${errorStr}`);
          break;
      }
    }
  }

  debug(message: string, context?: LogContext) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, contextOrError?: LogContext | Error, error?: Error) {
    if (contextOrError instanceof Error) {
      this.log(LogLevel.ERROR, message, undefined, contextOrError);
    } else {
      this.log(LogLevel.ERROR, message, contextOrError, error);
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }
}

// Create default logger instance
export const logger = new Logger(
  process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
);

// Export Logger class for custom instances
export { Logger };
