const fs = require('fs');
const path = require('path');

const appRoot = '/var/www/xhs-generator';
const standaloneServer = path.join(appRoot, '.next', 'standalone', 'server.js');
const useStandalone = fs.existsSync(standaloneServer);

module.exports = {
  apps: [{
    name: 'xhs-generator',
    script: useStandalone ? standaloneServer : 'node_modules/next/dist/bin/next',
    args: useStandalone ? '' : 'start',
    cwd: appRoot,
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 33001,
    },
    error_file: '/var/log/xhs-generator/error.log',
    out_file: '/var/log/xhs-generator/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
  }],
};
