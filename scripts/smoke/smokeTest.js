const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      throw new Error('Async test not supported');
    }
    process.stdout.write(`✔ ${name}\n`);
  } catch (error) {
    process.stdout.write(`✘ ${name}\n`);
    process.stdout.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

runTest('api/health responds 200 on GET', () => {
  const handler = require(path.join(repoRoot, 'src', 'pages', 'api', 'health.js'));
  const req = { method: 'GET' };
  const res = createMockRes();

  handler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body && res.body.ok === true, 'expected ok=true');
});

runTest('api/health rejects non-GET', () => {
  const handler = require(path.join(repoRoot, 'src', 'pages', 'api', 'health.js'));
  const req = { method: 'POST' };
  const res = createMockRes();

  handler(req, res);

  assert.strictEqual(res.statusCode, 405);
  assert.ok(res.body && res.body.error, 'expected error message');
});

runTest('workflow transition rules are enforced', () => {
  const workflow = require(path.join(
    repoRoot,
    'electron',
    'server',
    'services',
    'xhs',
    'workflow.js'
  ));

  assert.strictEqual(workflow.canTransition('captured', 'generating'), true);
  assert.strictEqual(workflow.canTransition('captured', 'published'), false);
});

runTest('scheduler cron parser returns next run date', () => {
  const cronParser = require(path.join(
    repoRoot,
    'electron',
    'server',
    'services',
    'scheduler',
    'cronParser.js'
  ));
  const now = new Date();
  const next = cronParser.getNextRunTime('interval', 30, null, now);

  assert.ok(next instanceof Date);
  assert.ok(next.getTime() > now.getTime(), 'expected next run time in future');
});
