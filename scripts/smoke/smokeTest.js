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

async function main() {
  await runTest('api/health responds 200 on GET', async () => {
    const handler = require(path.join(repoRoot, 'src', 'pages', 'api', 'health.js'));
    const req = { method: 'GET' };
    const res = createMockRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body && res.body.ok === true, 'expected ok=true');
  });

  await runTest('api/health rejects non-GET', async () => {
    const handler = require(path.join(repoRoot, 'src', 'pages', 'api', 'health.js'));
    const req = { method: 'POST' };
    const res = createMockRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 405);
    assert.ok(res.body && res.body.error, 'expected error message');
  });

  await runTest('workflow transition rules are enforced', async () => {
    const workflow = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'core',
      'workflow.js'
    ));

    assert.strictEqual(workflow.canTransition('captured', 'generating'), true);
    assert.strictEqual(workflow.canTransition('captured', 'published'), false);
  });

  await runTest('scheduler cron parser returns next run date', async () => {
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

  await runTest('jobs DTO validation accepts interval schedule', async () => {
    const dto = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'scheduler',
      'jobDto.js'
    ));

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

  await runTest('executions DTO normalization parses result_json', async () => {
    const dto = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'scheduler',
      'executionDto.js'
    ));

    const out = dto.normalizeExecutionRow({
      id: 1,
      job_id: 2,
      status: 'success',
      trigger_type: 'manual',
      duration_ms: 10,
      result_json: '{"total":3,"inserted":3}',
      error_message: null,
      created_at: new Date().toISOString(),
    });

    assert.ok(out.result_json);
    assert.strictEqual(out.result_json.total, 3);
  });

  await runTest('requestLimits clamps query params', async () => {
    const limits = require(path.join(
      repoRoot,
      'electron',
      'server',
      'utils',
      'requestLimits.js'
    ));

    assert.strictEqual(
      limits.parseNumberParam(undefined, { defaultValue: 7, min: 1, max: 90 }),
      7
    );
    assert.strictEqual(
      limits.parseNumberParam('0', { defaultValue: 7, min: 1, max: 90 }),
      1
    );
    assert.strictEqual(
      limits.parseNumberParam('999', { defaultValue: 7, min: 1, max: 90 }),
      90
    );
  });

  await runTest('ref-image augmentor prefers editorial archetype by default', async () => {
    const augmentor = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'referencePromptAugmentor.js'
    ));

    const base = '小红书封面：测试 editorial 默认';
    const insights = [
      {
        type: 'logo',
        bucket: 'content',
        layout_hints: ['3:4'],
        content_tags: [],
        style_tags: [],
      },
    ];

    const out = augmentor.buildFinalImagePrompt(base, insights);
    assert.ok(out.prompt.includes('Archetype: editorial_magazine_cover'));
    assert.ok(
      out.prompt.toLowerCase().includes('inside the main card')
        || out.prompt.toLowerCase().includes('inside card'),
      'expected inside-card brand mark guidance'
    );
  });

  await runTest('ref-image augmentor selects listicle archetype only on strong signals', async () => {
    const augmentor = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'referencePromptAugmentor.js'
    ));

    const base = '小红书封面：3 步 + 3 个坑，内容更丰富点';
    const insights = [
      {
        type: 'screenshot',
        bucket: 'content',
        layout_hints: [],
        content_tags: ['3步', '3个坑', '清单'],
        style_tags: [],
      },
    ];

    const out = augmentor.buildFinalImagePrompt(base, insights);
    assert.ok(out.prompt.includes('Archetype: big_number_listicle'));
    assert.ok(
      out.prompt.includes('Keep text density unchanged'),
      'richness mode should not encourage extra text blocks'
    );
  });

  await runTest('ref-image augmentor injects TITLE_SPEC when provided', async () => {
    const augmentor = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'referencePromptAugmentor.js'
    ));

    const out = augmentor.buildFinalImagePrompt('小红书封面：标题注入测试', [], {
      titleSpec: { headline: '新手上手', subline: '3步3坑' },
    });

    assert.ok(out.prompt.includes('XHS_COVER_TEMPLATE'));
    assert.ok(out.prompt.includes('TITLE_SPEC'));
    assert.ok(out.prompt.includes('新手上手'));
    assert.ok(out.prompt.includes('3步3坑'));
  });

  await runTest('ref-image augmentor lints + compiles typography preset into TITLE_SPEC', async () => {
    const augmentor = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'referencePromptAugmentor.js'
    ));

    const out = augmentor.buildFinalImagePrompt('小红书封面：排版预设注入测试', [], {
      titleSpec: {
        headline: '新功能上线',
        subline: '一眼看懂',
        badge: 'NEW',
        footer: '更新',
        typography: { preset: 6 },
      },
    });

    assert.ok(out.prompt.includes('TITLE_SPEC'));
    assert.ok(out.prompt.includes('Typography preset: 6'));
    assert.ok(out.prompt.includes('Typography position: bottom_center_in_card'));
    assert.ok(out.prompt.includes('BADGE'));
    assert.ok(out.prompt.includes('NEW'));
    assert.ok(out.prompt.includes('FOOTER'));
    assert.ok(out.prompt.includes('更新'));
  });

  await runTest('cover title-card generator returns a PNG buffer (opt-in)', async () => {
    if (process.env.XHS_COVER_TITLE_CARD_SMOKE !== '1') {
      // Puppeteer-based rendering can be flaky in CI without system deps.
      // Enable explicitly when validating locally.
      return;
    }

    const card = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'coverTitleCardReference.js'
    ));

    assert.ok(typeof card.generateCoverTitleCardPng === 'function');

    const outBuf = await card.generateCoverTitleCardPng({
      headline: '测试封面标题',
      subline: '副标题',
      width: 640,
      height: 854,
    });

    assert.ok(Buffer.isBuffer(outBuf));
    assert.strictEqual(outBuf.slice(0, 8).toString('hex'), '89504e470d0a1a0a');
  });

  await runTest('geminiClient getVisionModel returns an enabled Vision provider when DB is configured', async () => {
    const hasDb = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
    if (!hasDb) {
      // Keep CI/local runs without a DB configured green.
      return;
    }

    const geminiClient = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'llm',
      'geminiClient.js'
    ));

    assert.ok(geminiClient.__testOnly && typeof geminiClient.__testOnly.getVisionModel === 'function');

    const provider = await geminiClient.__testOnly.getVisionModel();
    assert.ok(provider, 'expected a provider row');
    assert.ok(provider.supportsVision === true || provider.supportsVision === 1);
    assert.ok(provider.isEnabled === true || provider.isEnabled === 1);
  });

  await runTest('coverTextOverlay modifies image buffer when enabled (opt-in)', async () => {
    if (process.env.XHS_COVER_TEXT_OVERLAY_SMOKE !== '1') {
      // Puppeteer-based rendering can be flaky in CI without system deps.
      // Enable explicitly when validating locally.
      return;
    }

    process.env.XHS_COVER_TEXT_OVERLAY = '1';

    const overlay = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'coverTextOverlay.js'
    ));

    assert.ok(typeof overlay.applyCoverTextOverlay === 'function');

    const jimp = require('jimp');
    const Jimp = jimp.Jimp || jimp.default || jimp;

    const base = new Jimp({ width: 800, height: 1066, color: 0xffffffff });
    const baseBuf = Buffer.from(await base.getBuffer('image/png'));

    const outBuf = await overlay.applyCoverTextOverlay(baseBuf, {
      titleText: '测试封面标题',
      subtitleText: '副标题',
    });

    assert.ok(Buffer.isBuffer(outBuf));
    assert.ok(outBuf.length > baseBuf.length, 'expected overlay output to be larger than base');

    const outImg = await Jimp.read(outBuf);
    const sample = outImg.getPixelColor(70, 70);
    assert.notStrictEqual(sample, 0xffffffff, 'expected overlay pixels to differ from plain white');
  });
}

main().catch((err) => {
  process.stdout.write(`✘ smoke suite crashed\n`);
  process.stdout.write(`${err.stack || err.message}\n`);
  process.exitCode = 1;
});
