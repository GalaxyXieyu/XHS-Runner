import fs from 'fs';
import path from 'path';
import { resolveUserDataPath } from './runtime/userDataPath';

const DEFAULT_CONFIG = {
  updateChannel: 'stable',
  logLevel: 'info',
};

export function getConfigPath() {
  return resolveUserDataPath('config.json');
}

export function getConfig() {
  const filePath = getConfigPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

export function setConfig(update: Record<string, any>) {
  const filePath = getConfigPath();
  const next = { ...getConfig(), ...update };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
