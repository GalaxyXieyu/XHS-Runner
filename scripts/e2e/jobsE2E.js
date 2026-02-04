/**
 * E2E (API-level): create job -> trigger -> observe executions -> cleanup.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/e2e/jobsE2E.js
 */

const assert = require('assert');
const { spawn } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOULD_START_SERVER = process.env.START_SERVER !== '0';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { res } = await jsonFetch(`${BASE_URL}/api/health`, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // ignore and retry
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  console.log(`=== E2E Jobs Test (${BASE_URL}) ===\n`);

  let serverProc = null;

  // Ensure server is reachable; if not, start a local Next dev server.
  const healthy = await waitForHealth(1500);
  if (!healthy) {
    if (!SHOULD_START_SERVER) {
      throw new Error(`Server not reachable at ${BASE_URL}. Start it first, or set START_SERVER=1.`);
    }

    console.log(`Server not reachable. Starting Next dev server...`);
    serverProc = spawn('npm', ['run', 'dev:next'], {
      stdio: 'inherit',
      env: process.env,
    });

    const ok = await waitForHealth(60_000);
    if (!ok) {
      serverProc.kill('SIGTERM');
      throw new Error('Timed out waiting for Next dev server to become healthy');
    }
  }

  let jobId;

  console.log('1) POST /api/jobs (create daily_generate interval job)');
  {
    const payload = {
      name: `e2e daily_generate ${Date.now()}`,
      job_type: 'daily_generate',
      schedule_type: 'interval',
      interval_minutes: 999,
      cron_expression: null,
      params: { output_count: 1 },
      is_enabled: true,
      priority: 5,
    };

    const { res, body } = await jsonFetch(`${BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Create job failed: ${res.status} ${JSON.stringify(body)}`);
    }

    assert.ok(body && typeof body.id === 'number');
    jobId = body.id;
    console.log(`   ✅ jobId=${jobId}`);
  }

  console.log('\n2) POST /api/jobs/:id/trigger');
  {
    const { res, body } = await jsonFetch(`${BASE_URL}/api/jobs/${jobId}/trigger`, { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Trigger failed: ${res.status} ${JSON.stringify(body)}`);
    }
    assert.ok(body && body.success === true);
    assert.ok(typeof body.executionId === 'number');
    console.log(`   ✅ executionId=${body.executionId}`);
  }

  console.log('\n3) Poll /api/jobs/executions?jobId=... until at least 1 row');
  {
    const deadline = Date.now() + 30_000;
    let last = [];

    while (Date.now() < deadline) {
      const { res, body } = await jsonFetch(`${BASE_URL}/api/jobs/executions?jobId=${jobId}&limit=5`, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`Executions query failed: ${res.status} ${JSON.stringify(body)}`);
      }

      const items = Array.isArray(body) ? body : [];
      last = items;
      if (items.length > 0) {
        console.log(`   ✅ got ${items.length} execution(s). latest status=${items[0].status}`);
        break;
      }

      await sleep(1000);
    }

    assert.ok(last.length > 0, 'expected at least 1 execution record');
  }

  console.log('\n4) DELETE /api/jobs/:id (cleanup)');
  {
    const { res, body } = await jsonFetch(`${BASE_URL}/api/jobs/${jobId}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`Delete failed: ${res.status} ${JSON.stringify(body)}`);
    }
    console.log('   ✅ deleted');
  }

  console.log('\n=== E2E Jobs Test done ===');

  if (serverProc) {
    serverProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('E2E jobs test failed:', err);
  process.exit(1);
});
