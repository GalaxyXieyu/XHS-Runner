import fs from 'fs';
import path from 'path';
import { resolveUserDataPath } from './runtime/userDataPath';

export function getLogPath() {
  const logDir = resolveUserDataPath('logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, 'app.log');
}

function writeLog(level: string, message: string, meta?: Record<string, any>) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    meta,
  });
  fs.appendFileSync(getLogPath(), `${line}\n`, 'utf8');
}

export const info = (message: string, meta?: Record<string, any>) => writeLog('info', message, meta);
export const warn = (message: string, meta?: Record<string, any>) => writeLog('warn', message, meta);
export const error = (message: string, meta?: Record<string, any>) => writeLog('error', message, meta);
