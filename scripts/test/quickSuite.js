const assert = require('assert');
const path = require('path');
const fs = require('fs/promises');

const repoRoot = path.resolve(__dirname, '..', '..');

let smokeDumpContext = null;

function isEnabledFlag(v) {
  return v === '1' || v === 'true';
}

function getSmokeTimestampSlug() {
  // Avoid ':' so the folder is Windows-friendly.
  return new Date().toISOString().replace(/:/g, '-');
}

async function getOrCreateSmokeDumpContext() {
  if (!isEnabledFlag(process.env.XHS_SMOKE_DUMP)) return null;
  if (smokeDumpContext) return smokeDumpContext;

  const baseParent = process.env.XHS_SMOKE_DUMP_DIR
    ? (path.isAbsolute(process.env.XHS_SMOKE_DUMP_DIR)
      ? process.env.XHS_SMOKE_DUMP_DIR
      : path.join(repoRoot, process.env.XHS_SMOKE_DUMP_DIR))
    : path.join(repoRoot, '.xhs-data', 'test-outputs');

  const ts = getSmokeTimestampSlug();
  const dir = path.join(baseParent, `${ts}-smoke`);
  await fs.mkdir(dir, { recursive: true });

  smokeDumpContext = {
    baseParent,
    dir,
    ts,
    uploadMinio:
      isEnabledFlag(process.env.XHS_SMOKE_UPLOAD_MINIO) && process.env.STORAGE_TYPE === 'minio',
    minioProvider: null,
  };

  process.stdout.write(`smoke dump enabled: ${dir}\n`);
  return smokeDumpContext;
}

function getMinioConfigFromEnv() {
  return {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '23030', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'xhs-assets',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    region: process.env.MINIO_REGION || 'us-east-1',
  };
}

async function maybeUploadSmokeImage(ctx, buffer, filename) {
  if (!ctx || !ctx.uploadMinio) return;

  if (!ctx.minioProvider) {
    const { MinIOStorageProvider } = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'storage',
      'MinIOStorageProvider.js'
    ));
    ctx.minioProvider = new MinIOStorageProvider(getMinioConfigFromEnv());
    await ctx.minioProvider.initialize();
  }

  const subdir = `smoke/${ctx.ts}`;
  const objectName = await ctx.minioProvider.store(buffer, filename, {
    subdir,
    contentType: 'image/png',
  });
  const url = await ctx.minioProvider.getUrl(objectName);

  process.stdout.write(`smoke uploaded: ${objectName}\n`);
  process.stdout.write(`smoke url: ${url}\n`);
}

async function maybeDumpSmokeImage(buffer, filename) {
  const ctx = await getOrCreateSmokeDumpContext();
  if (!ctx) return null;

  const outPath = path.join(ctx.dir, filename);
  await fs.writeFile(outPath, buffer);
  process.stdout.write(`smoke dumped: ${outPath}\n`);

  await maybeUploadSmokeImage(ctx, buffer, filename);
  return outPath;
}

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

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(t);
  });
}

function assertThrowsMessage(fn, needle) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    const msg = err && err.message ? String(err.message) : String(err);
    assert.ok(
      msg.includes(needle),
      `expected error message to include ${JSON.stringify(needle)}, got: ${JSON.stringify(msg)}`
    );
  }
  assert.ok(threw, 'expected function to throw');
}

async function assertRejectsMessage(promiseOrFn, needle) {
  let rejected = false;
  try {
    const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
    await p;
  } catch (err) {
    rejected = true;
    const msg = err && err.message ? String(err.message) : String(err);
    assert.ok(
      msg.includes(needle),
      `expected rejection message to include ${JSON.stringify(needle)}, got: ${JSON.stringify(msg)}`
    );
  }
  assert.ok(rejected, 'expected promise to reject');
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
    assert.ok(typeof res.body.timestamp === 'string', 'expected timestamp string');
    assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)), 'expected timestamp to be ISO-parseable');
  });

  await runTest('api/health rejects non-GET', async () => {
    const handler = require(path.join(repoRoot, 'src', 'pages', 'api', 'health.js'));
    const req = { method: 'POST' };
    const res = createMockRes();

    handler(req, res);

    assert.strictEqual(res.statusCode, 405);
    assert.ok(res.body && res.body.error, 'expected error message');
  });

  await runTest('runEvidence builder extracts prompt/model metadata deterministically', async () => {
    const { buildRunEvidence, sha256Hex } = require(path.join(
      repoRoot,
      'electron',
      'server',
      'utils',
      'runEvidence.js'
    ));

    const imageAssetIds = [101, 102, 103];
    const assets = [
      {
        id: 101,
        path: 'assets/a.png',
        metadata: JSON.stringify({
          prompt: 'final prompt A',
          sequence: 0,
          role: 'cover',
          provider: 'ark',
          model: 'seedream-v3',
          size: '1024x1536',
          watermark: true,
          aspectRatio: '3:4',
          url: 'https://example.com/image.jpg?sig=abc',
        }),
      },
      {
        id: 102,
        path: 'assets/b.png',
        metadata: {
          prompt: 'final prompt B',
          sequence: 1,
          role: 'body',
          provider: 'jimeng',
          model: 'jimeng_t2i_v40',
          imageUrls: ['https://ref.example/a.jpg', 'https://ref.example/b.jpg'],
        },
      },
    ];

    const evidence = buildRunEvidence({
      mode: 'fast',
      imageAssetIds,
      assets,
      promptPaths: ['prompts/image-1.prompt.txt', 'prompts/image-2.prompt.txt', null],
      includeFullPrompt: false,
    });

    assert.strictEqual(evidence.version, 2);
    assert.strictEqual(evidence.mode, 'fast');
    assert.deepStrictEqual(evidence.imageAssetIds, imageAssetIds);
    assert.strictEqual(evidence.images.length, 3);

    assert.strictEqual(evidence.images[0].assetId, 101);
    assert.strictEqual(evidence.images[0].finalPromptHash, sha256Hex('final prompt A'));
    assert.strictEqual(evidence.images[0].finalPromptPreview, 'final prompt A');
    assert.strictEqual(evidence.images[0].finalPromptPath, 'prompts/image-1.prompt.txt');
    assert.strictEqual(evidence.images[0].watermark, true);

    assert.strictEqual(evidence.images[1].assetId, 102);
    assert.strictEqual(evidence.images[1].referenceImageCount, 2);

    assert.strictEqual(evidence.images[2].assetId, 103);
    assert.strictEqual(evidence.images[2].missing, true);
    assert.deepStrictEqual(evidence.missingAssetIds, [103]);
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

  await runTest('scheduler cron parser returns deterministic next run date', async () => {
    const cronParser = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'scheduler',
      'cronParser.js'
    ));

    const now = new Date('2024-01-01T00:00:00.000Z');

    const intervalNext = cronParser.getNextRunTime('interval', 30, null, now);
    assert.ok(intervalNext instanceof Date);
    assert.strictEqual(intervalNext.getTime(), now.getTime() + 30 * 60 * 1000);

    const cronNext = cronParser.getNextRunTime('cron', null, '*/15 * * * *', now);
    assert.ok(cronNext instanceof Date);
    assert.strictEqual(cronNext.getTime(), now.getTime() + 15 * 60 * 1000);

    assert.deepStrictEqual(cronParser.validateCronExpression('*/15 * * * *'), { valid: true });
    const bad = cronParser.validateCronExpression('not a cron');
    assert.strictEqual(bad.valid, false);
    assert.ok(bad.error, 'expected cron validation error message');

    assert.strictEqual(cronParser.describeCronExpression('*/15 * * * *'), '每 15 分钟');
    assert.strictEqual(cronParser.describeCronExpression('0 */2 * * *'), '每 2 小时');
    assert.strictEqual(cronParser.describeCronExpression('0 8 * * *'), '每天 8:00');
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

  await runTest('jobs DTO validation rejects missing schedule fields (negative)', async () => {
    const dto = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'scheduler',
      'jobDto.js'
    ));

    assertThrowsMessage(() => {
      dto.parseCreateJobInput({
        name: 't',
        job_type: 'daily_generate',
        schedule_type: 'interval',
        interval_minutes: null,
        cron_expression: null,
        params: { output_count: 1 },
      });
    }, 'interval_minutes is required');

    assertThrowsMessage(() => {
      dto.parseCreateJobInput({
        name: 't',
        job_type: 'daily_generate',
        schedule_type: 'cron',
        interval_minutes: null,
        cron_expression: null,
        params: { output_count: 1 },
      });
    }, 'cron_expression is required');

    assertThrowsMessage(() => {
      dto.parseUpdateJobInput({
        schedule_type: 'interval',
        interval_minutes: null,
      });
    }, 'interval_minutes is required');

    assertThrowsMessage(() => {
      dto.parseUpdateJobInput({
        schedule_type: 'cron',
        cron_expression: null,
      });
    }, 'cron_expression is required');
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

  await runTest('requestLimits clamps + normalizes query params', async () => {
    const limits = require(path.join(repoRoot, 'electron', 'server', 'utils', 'requestLimits.js'));

    assert.strictEqual(limits.parseNumberParam(undefined, { defaultValue: 7, min: 1, max: 90 }), 7);
    assert.strictEqual(limits.parseNumberParam('0', { defaultValue: 7, min: 1, max: 90 }), 1);
    assert.strictEqual(limits.parseNumberParam('999', { defaultValue: 7, min: 1, max: 90 }), 90);
    assert.strictEqual(limits.parseNumberParam('nope', { defaultValue: 7, min: 1, max: 90 }), 7);
    assert.strictEqual(limits.parseNumberParam(['5', '10'], { defaultValue: 7, min: 1, max: 90 }), 5);
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

  await runTest('ref-image augmentor selects comparison archetype on clear comparison refs', async () => {
    const augmentor = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'referencePromptAugmentor.js'
    ));

    const base = '小红书封面：A/B 对比';
    const insights = [
      {
        type: 'screenshot',
        bucket: 'content',
        layout_hints: [],
        content_tags: ['对比', '前后', 'A/B'],
        style_tags: [],
      },
    ];

    const out = augmentor.buildFinalImagePrompt(base, insights);
    assert.ok(out.prompt.includes('Archetype: split_panel_comparison'));
  });

  await runTest('ref-image augmentor buildReferenceInsightsFromInputs maps buckets + types', async () => {
    const augmentor = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'referencePromptAugmentor.js'
    ));

    const out = augmentor.buildReferenceInsightsFromInputs([
      { url: 'https://example.com/brand-logo.png', type: 'content' },
      { url: 'https://example.com/layout-ui-screenshot.jpg', type: 'layout' },
      { url: 'https://example.com/style-ref.png', type: 'style' },
      { url: 'https://example.com/unknown.png' },
    ]);

    assert.ok(Array.isArray(out) && out.length === 4);
    assert.strictEqual(out[0].bucket, 'content');
    assert.strictEqual(out[0].type, 'logo');
    assert.strictEqual(out[1].bucket, 'style');
    assert.strictEqual(out[1].type, 'screenshot');
    assert.strictEqual(out[2].bucket, 'style');
    assert.ok(out[2].style_tags && out[2].style_tags.length > 0);
    assert.strictEqual(out[3].bucket, 'both');
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

  await runTest('ref-image augmentor TITLE_SPEC variants are stable (parameterized)', async () => {
    const augmentor = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'referencePromptAugmentor.js'
    ));

    const cases = [
      {
        name: 'headline only -> omits optional fields',
        base: '小红书封面：headline-only',
        titleSpec: { headline: '十个字标题测试' },
        expects: ['TITLE_SPEC', 'H2: (omit)', 'BADGE: (omit)', 'FOOTER: (omit)'],
      },
      {
        name: 'long subline preserved',
        base: '小红书封面：long-subline',
        titleSpec: { headline: '主标题', subline: '这是一个非常非常长的副标题，用于回归测试' },
        expects: ['TITLE_SPEC', '主标题', '这是一个非常非常长的副标题'],
      },
      {
        name: 'typography preset accepts string + invalid position falls back',
        base: '小红书封面：preset-string',
        titleSpec: {
          headline: '发布更新',
          badge: 'NEW',
          footer: 'v1.2',
          typography: { preset: '6', position: 'nope', font: { family: 'serif', weight: 'regular' } },
        },
        expects: [
          'TITLE_SPEC',
          'Typography preset: 6',
          'Typography position: bottom_center_in_card',
          'Font style hint: family="serif"',
          'weight="regular"',
        ],
      },
      {
        name: 'emoji/non-ascii is included verbatim',
        base: '小红书封面：emoji',
        titleSpec: { headline: '上新🚀', subline: '更快更稳' },
        expects: ['TITLE_SPEC', '上新🚀', '更快更稳'],
      },
    ];

    for (const c of cases) {
      const out = augmentor.buildFinalImagePrompt(c.base, [], { titleSpec: c.titleSpec });
      for (const needle of c.expects) {
        assert.ok(out.prompt.includes(needle), `case=${c.name}: expected to include ${JSON.stringify(needle)}`);
      }
    }

    const base = '小红书封面：missing-headline';
    const out = augmentor.buildFinalImagePrompt(base, [], {
      titleSpec: { headline: '   ', subline: '不会注入' },
    });
    assert.strictEqual(out.prompt, base, 'missing headline should not inject TITLE_SPEC block');
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

  await runTest('cover title-card HTML escapes + clamps text (__testOnly)', async () => {
    const card = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'coverTitleCardReference.js'
    ));

    assert.ok(card.__testOnly && typeof card.__testOnly.buildTitleCardHtml === 'function');

    const html = card.__testOnly.buildTitleCardHtml({
      width: 640,
      height: 854,
      headline: '<b>Title & Co</b> with a very very long headline that should clamp',
      subline: 'sub <script>alert(1)</script> line that is also long long long',
    });

    assert.ok(html.includes('width=640'));
    assert.ok(html.includes('&lt;b&gt;Title &amp; Co&lt;/b&gt;'));
    assert.ok(
      html.includes('&lt;script&gt;alert(1)&lt;/'),
      'expected subline HTML to be escaped (script tag)'
    );
    assert.ok(html.includes('…'), 'expected clamp ellipsis');
  });

  await runTest('cover title-card generator rejects missing headline (fast)', async () => {
    const card = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'coverTitleCardReference.js'
    ));

    // Rejects before puppeteer launch.
    await assertRejectsMessage(
      card.generateCoverTitleCardPng({ headline: '   ', width: 640, height: 854 }),
      'TITLE_CARD_MISSING_HEADLINE'
    );
  });

  await runTest('cover title-card generator returns a PNG buffer with stable dimensions (opt-in)', async () => {
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

    const outBuf = await withTimeout(
      card.generateCoverTitleCardPng({
        headline: '测试封面标题',
        subline: '副标题',
        width: 640,
        height: 854,
      }),
      25000,
      'coverTitleCardReference.generateCoverTitleCardPng'
    );

    await maybeDumpSmokeImage(outBuf, 'title-card.png');

    assert.ok(Buffer.isBuffer(outBuf));
    assert.strictEqual(outBuf.slice(0, 8).toString('hex'), '89504e470d0a1a0a');

    const jimp = require('jimp');
    const Jimp = jimp.Jimp || jimp.default || jimp;
    const img = await Jimp.read(outBuf);
    assert.strictEqual(img.bitmap.width, 640);
    assert.strictEqual(img.bitmap.height, 854);

    const dataUrl = card.coverTitleCardToDataUrl(outBuf);
    assert.ok(typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,'));
  });

  await runTest('geminiClient generateImageWithReference uses GEMINI_API_KEY env without DB', async () => {
    const oldFetch = global.fetch;
    const oldEnv = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_BASE_URL: process.env.GEMINI_BASE_URL,
      GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL,
      DATABASE_URL: process.env.DATABASE_URL,
      POSTGRES_URL: process.env.POSTGRES_URL,
      SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    };

    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.SUPABASE_DB_URL;

    process.env.GEMINI_API_KEY = 'test';
    process.env.GEMINI_BASE_URL = 'https://yunwu.test/v1';
    process.env.GEMINI_IMAGE_MODEL = 'test-image-model';

    let captured = null;

    global.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [
                    { inlineData: { mimeType: 'image/png', data: 'dGVzdA==' } },
                  ],
                },
              },
            ],
          };
        },
        async text() {
          return '';
        },
      };
    };

    try {
      const modulePath = path.join(
        repoRoot,
        'electron',
        'server',
        'services',
        'xhs',
        'llm',
        'geminiClient.js'
      );
      delete require.cache[require.resolve(modulePath)];
      const geminiClient = require(modulePath);

      const out = await geminiClient.generateImageWithReference({
        prompt: 'p',
        referenceImageUrls: ['data:image/png;base64,aGVsbG8='],
        aspectRatio: '3:4',
      });

      assert.ok(captured, 'expected fetch to be called');
      assert.strictEqual(
        captured.url,
        'https://yunwu.test/v1beta/models/test-image-model:generateContent'
      );
      assert.strictEqual(captured.options.method, 'POST');
      assert.strictEqual(captured.options.headers['x-goog-api-key'], 'test');
      assert.ok(out && out.imageBase64 === 'dGVzdA==');
      assert.strictEqual(out.mimeType, 'image/png');
    } finally {
      global.fetch = oldFetch;
      for (const k of Object.keys(oldEnv)) {
        if (oldEnv[k] === undefined) delete process.env[k];
        else process.env[k] = oldEnv[k];
      }
    }
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

  await runTest('arkImageClient generateArkImage posts Ark request and normalizes urls', async () => {
    const ark = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'arkImageClient.js'
    ));

    const oldFetch = global.fetch;
    let captured = null;

    global.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            created: 123,
            model: 'doubao-seedream-5-0-260128',
            data: [{ url: 'https://example.com/image.png' }],
          };
        },
        async text() {
          return '';
        },
      };
    };

    try {
      const res = await ark.generateArkImage({
        apiKey: 'test-key',
        baseUrl: 'https://ark.test/api/v3/images/generations',
        model: 'doubao-seedream-5-0-260128',
        prompt: 'a cat',
        size: '1728x2304',
        watermark: false,
      });

      assert.ok(captured, 'expected fetch to be called');
      assert.strictEqual(captured.url, 'https://ark.test/api/v3/images/generations');
      assert.strictEqual(captured.options.method, 'POST');
      assert.ok(captured.options.headers && captured.options.headers.Authorization);

      const body = JSON.parse(captured.options.body);
      assert.strictEqual(body.model, 'doubao-seedream-5-0-260128');
      assert.strictEqual(body.prompt, 'a cat');
      assert.strictEqual(body.size, '1728x2304');
      assert.strictEqual(body.watermark, false);
      assert.strictEqual(body.response_format, 'url');
      assert.strictEqual(body.sequential_image_generation, 'disabled');
      assert.strictEqual(body.stream, false);

      assert.deepStrictEqual(res.urls, ['https://example.com/image.png']);
    } finally {
      global.fetch = oldFetch;
    }
  });

  await runTest('arkImageClient allows 4 concurrent generations (no global lock)', async () => {
    const ark = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'arkImageClient.js'
    ));

    const oldFetch = global.fetch;
    let inFlight = 0;
    let maxInFlight = 0;
    let counter = 0;

    global.fetch = (url, options) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return new Promise((resolve) => {
        setTimeout(() => {
          const idx = counter++;
          inFlight -= 1;
          resolve({
            ok: true,
            status: 200,
            async json() {
              return {
                created: 123,
                data: [{ url: `https://example.com/${idx}.png` }],
              };
            },
            async text() {
              return '';
            },
          });
        }, 50);
      });
    };

    try {
      await Promise.all(
        Array.from({ length: 4 }).map((_, i) =>
          ark.generateArkImage({
            apiKey: 'test-key',
            baseUrl: 'https://ark.test/api/v3/images/generations',
            model: 'doubao-seedream-5-0-260128',
            prompt: `p${i}`,
            size: '1728x2304',
            watermark: false,
          })
        )
      );

      assert.strictEqual(maxInFlight, 4, `expected max in-flight fetches to be 4, got ${maxInFlight}`);
    } finally {
      global.fetch = oldFetch;
    }
  });

  await runTest('coverTextOverlay HTML escapes + clamps text (__testOnly)', async () => {
    const overlay = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'coverTextOverlay.js'
    ));

    assert.ok(overlay.__testOnly && typeof overlay.__testOnly.buildCoverHtml === 'function');

    const html = overlay.__testOnly.buildCoverHtml({
      width: 800,
      height: 1066,
      base64Png: Buffer.from('png').toString('base64'),
      titleText: '<b>Title & Co</b> with a very very very long title that should clamp',
      subtitleText: 'sub <script>alert(1)</script> line that is also long long long',
    });

    assert.ok(html.includes('width=800'));
    assert.ok(html.includes('&lt;b&gt;Title &amp; Co&lt;/b&gt;'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('…'), 'expected clamp ellipsis');
  });

  await runTest('coverTextOverlay returns original buffer when titleText is missing', async () => {
    const overlay = require(path.join(
      repoRoot,
      'electron',
      'server',
      'services',
      'xhs',
      'integration',
      'coverTextOverlay.js'
    ));

    const baseBuf = Buffer.from('not an image');
    const outBuf = await overlay.applyCoverTextOverlay(baseBuf, { titleText: '   ' });

    assert.strictEqual(outBuf, baseBuf);
  });

  await runTest('coverTextOverlay modifies image buffer when enabled (opt-in)', async () => {
    if (process.env.XHS_COVER_TEXT_OVERLAY_SMOKE !== '1') {
      // Puppeteer-based rendering can be flaky in CI without system deps.
      // Enable explicitly when validating locally.
      return;
    }

    const oldEnv = process.env.XHS_COVER_TEXT_OVERLAY;
    process.env.XHS_COVER_TEXT_OVERLAY = '1';

    try {
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

      await maybeDumpSmokeImage(baseBuf, 'overlay-base.png');

      const outBuf = await withTimeout(
        overlay.applyCoverTextOverlay(baseBuf, {
          titleText: '测试封面标题',
          subtitleText: '副标题',
        }),
        30000,
        'coverTextOverlay.applyCoverTextOverlay'
      );

      await maybeDumpSmokeImage(outBuf, 'overlay.png');

      assert.ok(Buffer.isBuffer(outBuf));
      assert.ok(outBuf.length > baseBuf.length, 'expected overlay output to be larger than base');

      const outImg = await Jimp.read(outBuf);
      assert.strictEqual(outImg.bitmap.width, 800);
      assert.strictEqual(outImg.bitmap.height, 1066);

      const sample = outImg.getPixelColor(70, 70);
      assert.notStrictEqual(sample, 0xffffffff, 'expected overlay pixels to differ from plain white');
    } finally {
      if (oldEnv === undefined) delete process.env.XHS_COVER_TEXT_OVERLAY;
      else process.env.XHS_COVER_TEXT_OVERLAY = oldEnv;
    }
  });
}

main().catch((err) => {
  process.stdout.write(`✘ smoke suite crashed\n`);
  process.stdout.write(`${err.stack || err.message}\n`);
  process.exitCode = 1;
});
