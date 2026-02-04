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
  } catch {
    threw = true;
  }
  assert.strictEqual(threw, true, 'expected function to throw');
}

async function main() {
  const dto = require(path.join(repoRoot, 'electron', 'server', 'services', 'scheduler', 'executionDto.js'));

  await runTest('normalizeExecutionRow parses string result_json', async () => {
    const out = dto.normalizeExecutionRow({
      id: 1,
      job_id: 2,
      status: 'success',
      trigger_type: 'manual',
      duration_ms: 123,
      result_json: '{"total":5,"inserted":5}',
      error_message: null,
      created_at: new Date().toISOString(),
    });

    assert.strictEqual(out.id, 1);
    assert.ok(out.result_json);
    assert.strictEqual(out.result_json.total, 5);
  });

  await runTest('normalizeExecutionRow keeps object result_json', async () => {
    const out = dto.normalizeExecutionRow({
      id: 1,
      job_id: 2,
      status: 'failed',
      result_json: { total: 1, inserted: 0 },
    });
    assert.ok(out.result_json);
    assert.strictEqual(out.result_json.inserted, 0);
  });

  await runTest('normalizeExecutionRow rejects missing required fields', async () => {
    mustThrow(() => dto.normalizeExecutionRow({ id: 1 }));
  });
}

main().catch((err) => {
  process.stdout.write(`✘ executions dto smoke suite crashed\n`);
  process.stdout.write(`${err.stack || err.message}\n`);
  process.exitCode = 1;
});
