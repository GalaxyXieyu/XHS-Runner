# Ref-Image Prompt Routing (XHS) - Dev + Test Plan

Goal

- Reintroduce and improve the reference-image workflow for XHS cover generation (3:4).
- Auto-analyze uploaded reference images and route each into style/content/both.
- Use the analysis to augment the final image-generation prompt (prompt-only; no compositing).
- Default aesthetic direction: "editorial / premium magazine" with optional "richer" details, while still fitting XHS mobile readability rules.

Non-Goals (for this iteration)

- Pixel-perfect logo placement / compositing.
- A full UI toggle panel for every knob (we can add later if needed).

---

## Current Implementation Status (Already Done)

Reference image analysis + prompt augmentation is already wired into the image generation node.

Key files (entry points)

- Ref image analysis output contract:
  - `src/server/services/xhs/referenceImageInsights.ts`
- Ref image analysis (Vision -> JSON) (best-effort fallback):
  - `src/server/services/xhs/llm/geminiClient.ts`
- Prompt augmentation builder:
  - `src/server/services/xhs/integration/referencePromptAugmentor.ts`
- Image generation node wiring (upload refs -> analyze -> build final prompt -> generate):
  - `src/server/agents/nodes/imageNode.ts`

XHS template rules

- `referencePromptAugmentor.ts` now injects an `XHS_COVER_TEMPLATE` block into the final prompt.
- If the user asks for "richer" content (keywords like "\u5185\u5bb9\u66f4\u4e30\u5bcc"), the template adds 1-2 premium supporting cues (still avoiding dense text blocks).

---

## Model-Native Cover Title (Preferred)

Goal

- Make the cover headline appear as part of the model-generated image (blended typography), not as a post-process overlay.
- Keep a reliability ladder: prompt-first -> optional title-card reference -> emergency overlay.

How it works (code)

- Prompt-first: for cover images, we inject a strict `TITLE_SPEC` block into the final prompt.
  - Headline <= 10 Chinese chars, bold sans, high contrast, avoid punctuation, avoid tiny text.
  - Stable top title zone with a solid/gradient panel behind text.
- Title-card reference (optional but enabled by default): we render a small PNG title-card via Puppeteer and pass it as an additional reference image to the generation call.
  - Env: `XHS_COVER_TITLE_CARD_REFERENCE=0|1` (default: 1)
  - The model is instructed to treat the last reference image as a typography/layout anchor and still blend it into the cover.
- Emergency fallback overlay (opt-in, OFF by default): the old post-process overlay utility still exists.
  - Env: `XHS_COVER_TEXT_OVERLAY=0|1` (default: 0)

How title text is chosen

- Priority order (cover only): `textOverlayPlan.titleText` -> `generatedContent.title` -> `creativeBrief.topic` -> message heuristics (`封面标题: ...` / `小红书封面: ...`) -> basePrompt fallback.

Local testing tips

- If you want to help the heuristic, include one of these patterns in `--message`:
  - `封面标题: 你的标题`
  - `小红书封面: 你的标题`
- For structured cover typography (H1/H2/BADGE/FOOTER + preset-driven layout defaults), include lines like:
  - `封面排版预设: 2` (listicle/tutorial, top_left)
  - `封面排版预设: 3` (comparison, center)
  - `封面排版预设: 6` (feature release, bottom_center inside card)
  - `封面H1: 你的主标题`
  - `封面H2: 你的副标题`
  - `封面BADGE: 角标文案`
  - `封面FOOTER: 底部文案`
- `scripts/test-agent-api.ts` also supports convenience flags: `--preset/--h1/--h2/--badge/--footer` and will expand them into those message lines automatically.
- To generate only the cover, include: `只生成封面` / `仅生成封面` / `cover only`.

---

## What We Still Need To Do (Development Plan)

### Phase 1 - Prompt Strategy Lock-In (XHS only)

Objective

- Make the default XHS archetype strongly prefer an editorial magazine-like cover.
- Keep the XHS constraints hard (hierarchy, text limits, safe area, contrast).
- Make logo placement guidance default to "inside the card" (not corner badge).

Tasks

1) Update `XHS_COVER_TEMPLATE` default preference
   - Prefer `magazine_cover` when no strong signals for comparison/listicle.

2) Card-inside brand placement guidance
   - For content_ref/logo, bias to "brand mark inside the main card".
   - Keep it flexible: top-left inside card (title lockup) OR center small mark.

3) Theme-color autonomy
   - Encourage the model to pick a background that supports readability.
   - Explicitly allow dark/light/gradient/texture as long as text/logo stay high contrast.

4) Richness policy (safe)
   - Richness should mean: +1 sticker/tag +1 micro element (divider / micro-grid / tiny icon row).
   - Not: adding 3+ text blocks or paragraph text.

Deliverable

- One small patch set mainly in:
  - `src/server/services/xhs/integration/referencePromptAugmentor.ts`

### Phase 2 - Testing Harness (Fast Review)

Objective

- Be able to run 3 themes quickly and compare output without opening Langfuse.

Tasks

1) Use `scripts/test-agent-api.ts` as the primary test runner.
   - It now supports passing refs via CLI:
     - `--ref "<url>|style"`
     - `--ref "<url>|content"`
     - `--layout dense|balanced|visual-first` (optional)

2) Ensure outputs are saved to disk for review
   - `scripts/test-agent-api.ts` always downloads generated images into:
     - `.xhs-data/test-outputs/<timestamp>-run/<mode>/` (override with `--out`)

3) Define success rubric (below) and a pass/fail checklist.

Deliverable

- A repeatable command set (copy/paste) for each theme.
- A short checklist to judge success.

---

## Test Assets (OpenClaw refs)

Prefer direct-downloadable URLs (no redirects). For Jimeng, GitHub raw/blob URLs are automatically rehosted to Superbed when SUPERBED_TOKEN is configured, but using an already-direct Superbed CDN URL is fastest/most reliable.

Reference set (GitHub source URLs):

- Logo (light):
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png
- Logo (dark):
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text-dark.png
- Product/UI screenshot:
  - https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg

---

## Three Themes (A/B/C)

We will test the same cover style logic across three different topics.

Theme A (routing + subagent workflow)

- Headline intent: "route + subagent" makes the system fast and non-stalling.
- Suggested message:
  - "\u5c0f\u7ea2\u4e66\u5c01\u9762\uff1aOpenClaw \u7684 skill-router + subagent \u5de5\u4f5c\u6d41\uff0c\u600e\u4e48\u4ece\u5361\u6b7b\u53d8\u6210\u53ef\u63a7\u53ef\u89c2\u6d4b\uff0c\u5185\u5bb9\u66f4\u4e30\u5bcc\u70b9\uff0c\u9ad8\u7ea7\u6742\u5fd7\u611f\uff0clogo \u653e\u5361\u7247\u5185\u3002"

Theme B (product value / system)

- Headline intent: multi-channel + tools + automation.
- Suggested message:
  - "\u5c0f\u7ea2\u4e66\u5c01\u9762\uff1aOpenClaw \u662f\u600e\u6837\u628a AI \u52a9\u624b\u505a\u6210\u201c\u591a\u6e20\u9053 + \u5de5\u5177 + \u81ea\u52a8\u5316\u201d\uff0c\u5185\u5bb9\u66f4\u4e30\u5bcc\u70b9\uff0c\u9ad8\u7ea7\u6742\u5fd7\u611f\uff0clogo \u653e\u5361\u7247\u5185\u3002"

Theme C (tutorial/listicle)

- Headline intent: 3 steps + 3 pitfalls.
- Suggested message:
  - "\u5c0f\u7ea2\u4e66\u5c01\u9762\uff1aOpenClaw \u65b0\u624b\u4e0a\u624b\uff0c3 \u6b65\u642d\u5efa + 3 \u4e2a\u5751\uff0c\u5185\u5bb9\u66f4\u4e30\u5bcc\u70b9\uff0c\u9ad8\u7ea7\u6742\u5fd7\u611f\uff0clogo \u653e\u5361\u7247\u5185\u3002"

---

## Test Matrix (Per Theme)

For each theme, run two variants:

Variant 1 (content refs only)

- Purpose: test content_ref path (logo + UI) and card-inside placement guidance.
- Refs:
  - logo + UI screenshot

Variant 2 (content + style)

- Purpose: test that a style_ref can shift tone/material/lighting while keeping content readability.
- Refs:
  - logo + UI screenshot + (optional) an editorial style image URL you provide.

Notes

- If you do not have a style_ref URL, we still get value from Variant 1.
- This iteration is prompt-only; do not expect pixel-perfect logo reproduction.

---

## Commands (Copy/Paste)

Prereq

1) Start the web app:

```bash
# Optional (dev-only): skip login gate for /api/agent/* and /api/assets/* so the CLI harness can run without cookies.
export ALLOW_DEV_AGENT_API_NO_AUTH=1

npm run dev:next
```

2) In another terminal, run tests:

Notes

- Default mode is fast (pass `--normal` for normal).
- HITL is disabled by default (no interruptAfter pauses); the script will auto-continue if a pause still happens.
- Images are always saved to disk; the script prints the output directory at the end.

Template

```bash
AGENT_API_BASE=http://localhost:3000 \
npx tsx scripts/test-agent-api.ts \
  --message "<THEME_MESSAGE>" \
  --provider jimeng \
  --preset 2 \
  --h1 "你的主标题" \
  --badge "角标" \
  --footer "底部" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png|content" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg|content"
```

Typography preset A/B/C (same theme prompt, different cover layout)

- Preset A (2 = listicle/tutorial, top_left)

```bash
AGENT_API_BASE=http://localhost:3000 \
npx tsx scripts/test-agent-api.ts \
  --message "<THEME_MESSAGE>" \
  --provider jimeng \
  --preset 2 --h1 "你的主标题" --badge "角标" --footer "底部" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png|content" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg|content"
```

- Preset B (3 = comparison, center)

```bash
AGENT_API_BASE=http://localhost:3000 \
npx tsx scripts/test-agent-api.ts \
  --message "<THEME_MESSAGE>" \
  --provider jimeng \
  --preset 3 --h1 "A vs B" --h2 "优缺点对比" --badge "对比" --footer "2026" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png|content" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg|content"
```

- Preset C (6 = feature release, bottom_center inside card)

```bash
AGENT_API_BASE=http://localhost:3000 \
npx tsx scripts/test-agent-api.ts \
  --message "<THEME_MESSAGE>" \
  --provider jimeng \
  --preset 6 --h1 "新功能上线" --h2 "一眼看懂" --badge "NEW" --footer "更新" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png|content" \
  --ref "https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg|content"
```

Exact runs (Variant 1 = content refs only)

Theme A

```bash
AGENT_API_BASE=http://localhost:3000 \
npx tsx scripts/test-agent-api.ts \
  --message '小红书封面：OpenClaw 的 skill-router + subagent 工作流，怎么从卡死变成可控可观测，内容更丰富点，高级杂志感，logo 放卡片内。' \
  --provider jimeng \
  --layout visual-first \
  --ref 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png|content' \
  --ref 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg|content'
```

Theme B

```bash
AGENT_API_BASE=http://localhost:3000 \
npx tsx scripts/test-agent-api.ts \
  --message '小红书封面：OpenClaw 是怎样把 AI 助手做成“多渠道 + 工具 + 自动化”，内容更丰富点，高级杂志感，logo 放卡片内。' \
  --provider jimeng \
  --layout visual-first \
  --ref 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png|content' \
  --ref 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg|content'
```

Theme C

```bash
AGENT_API_BASE=http://localhost:3000 \
npx tsx scripts/test-agent-api.ts \
  --message '小红书封面：OpenClaw 新手上手，3 步搭建 + 3 个坑，内容更丰富点，高级杂志感，logo 放卡片内。' \
  --provider jimeng \
  --layout balanced \
  --ref 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png|content' \
  --ref 'https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/showcase/agents-ui.jpg|content'
```

Variant 2 (add a style ref)

- Add one more `--ref '<style_image_url>|style'` line to any command above.

---

## Success Criteria (Review Checklist)

Hard requirements (must pass)

- Readability: headline is legible in thumbnail view (high contrast, large type, no tiny paragraphs).
- Hierarchy: subject/brand/title/subtitle clearly separated; no clutter.
- XHS fit: 3:4 cover looks like an XHS cover, not a random poster.
- Brand: logo/brand mark is suggested/visible in-card (not lost as background texture).
- Failure mode: if vision analysis fails, generation still completes (no crash / no hang).

Soft preferences (nice to have)

- Editorial feel: matte paper/film grain/micro-grid details (when requested rich) without becoming noisy.
- Theme colors: background colors feel coherent with the OpenClaw assets (not random neon unless asked).

---

## How We Decide "Which Theme Works Best"

For each theme, compare Variant 1 images side-by-side and pick the one with:

- Best readability at small size.
- Best editorial premium feel.
- Strongest alignment to theme intent (A/B/C).

Then we tune the prompt template weights accordingly.

---

## Optional Next Step (After Review)

If you want more control without turning it into heavy engineering:

- Add one small UI toggle:
  - Tone: Auto / Editorial / Viral
  - Richness: Normal / Rich

But it is optional; we can iterate using natural language first.

---

## Engineering Guardrails

- Keep changes minimal and non-redundant. Prefer small helper functions and reuse existing utilities.
- If the same failure occurs more than 3 times consecutively during debugging, stop and spawn a fresh subagent to investigate from scratch (avoid tunnel vision).
