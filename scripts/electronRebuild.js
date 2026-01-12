const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveProjectRoot() {
  return path.join(__dirname, '..');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveElectronVersion(projectRoot) {
  try {
    return require(path.join(projectRoot, 'node_modules', 'electron', 'package.json')).version;
  } catch (error) {
    const reason = error && error.message ? error.message : String(error);
    throw new Error(
      `无法读取 Electron 版本（node_modules 可能未安装完整）: ${reason}\n\n请先执行：npm install`
    );
  }
}

function runElectronRebuild(projectRoot) {
  const electronVersion = resolveElectronVersion(projectRoot);
  const devdir = path.join(projectRoot, '.electron-gyp');
  ensureDir(devdir);

  const entryPath = require.resolve('@electron/rebuild', { paths: [projectRoot] });
  let pkgRoot = path.dirname(entryPath);
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(pkgRoot, 'package.json');
    if (fs.existsSync(candidate)) {
      break;
    }
    const parent = path.dirname(pkgRoot);
    if (parent === pkgRoot) {
      break;
    }
    pkgRoot = parent;
  }

  const cliPath = path.join(pkgRoot, 'lib', 'cli.js');
  const args = [
    cliPath,
    '--version',
    electronVersion,
    '--module-dir',
    projectRoot,
    '--force',
    '--which-module',
    'better-sqlite3',
  ];

  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_devdir: devdir,
    },
  });

  return typeof result.status === 'number' ? result.status : 1;
}

function main() {
  const projectRoot = resolveProjectRoot();
  const exitCode = runElectronRebuild(projectRoot);
  process.exit(exitCode);
}

main();
