const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

async function runTest(name, fn) {
  try {
    await fn();
    process.stdout.write(`✔ ${name}\n`);
  } catch (error) {
    process.stdout.write(`✘ ${name}\n`);
    process.stdout.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

function mustThrow(fn) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, true, 'expected function to throw');
}

async function main() {
  // Compiled by `npm run build:server` (tsconfig.server.json includes src/server/**)
  const dto = require(path.join(repoRoot, 'electron', 'server', 'services', 'scheduler', 'jobDto.js'));

  await runTest('parseCreateJobInput accepts interval schedule', async () => {
    const out = dto.parseCreateJobInput({
      name: 't',
      job_type: 'daily_generate',
      schedule_type: 'interval',
      interval_minutes: 30,
      cron_expression: null,
      params: { output_count: 1 },
      is_enabled: true,
      priority: 5,
    });
    assert.strictEqual(out.schedule_type, 'interval');
    assert.strictEqual(out.interval_minutes, 30);
  });

  await runTest('parseCreateJobInput rejects interval without interval_minutes', async () => {
    mustThrow(() => dto.parseCreateJobInput({
      name: 't',
      job_type: 'daily_generate',
      schedule_type: 'interval',
    }));
  });

  await runTest('parseCreateJobInput accepts cron schedule', async () => {
    const out = dto.parseCreateJobInput({
      name: 't',
      job_type: 'daily_generate',
      schedule_type: 'cron',
      cron_expression: '0 9 * * *',
      interval_minutes: null,
    });
    assert.strictEqual(out.schedule_type, 'cron');
    assert.strictEqual(out.cron_expression, '0 9 * * *');
  });

  await runTest('parseUpdateJobInput accepts partial update', async () => {
    const out = dto.parseUpdateJobInput({ is_enabled: false, priority: 10 });
    assert.strictEqual(out.is_enabled, false);
    assert.strictEqual(out.priority, 10);
  });

  await runTest('jobStatusSchema accepts active/paused only', async () => {
    const ok = dto.jobStatusSchema.parse({ status: 'active' });
    assert.strictEqual(ok.status, 'active');
    mustThrow(() => dto.jobStatusSchema.parse({ status: 'running' }));
  });
}

main().catch((err) => {
  process.stdout.write(`✘ jobs dto smoke suite crashed\n`);
  process.stdout.write(`${err.stack || err.message}\n`);
  process.exitCode = 1;
});
