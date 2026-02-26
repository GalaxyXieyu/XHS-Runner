import crypto from "crypto";
import type { ReferenceImageInsight } from "../referenceImageInsights";

function dedupe(strings: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of strings) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export type ExplicitReferenceInput = {
  url: string;
  type?: "style" | "layout" | "content";
};

export enum TypographyPreset {
  // Listicle/tutorial: big-number listicles, steps, checklists.
  ListicleTutorial = 2,
  // Comparison: VS/PK, A vs B, pros/cons.
  Comparison = 3,
  // Feature release: new feature announcement / update.
  FeatureRelease = 6,
}

export type TypographyPosition = "top_left" | "center" | "bottom_center_in_card";

export type TypographyFontStyle = {
  // Keep this intentionally lightweight; we pass as hints into TITLE_SPEC.
  family?: "sans" | "rounded_sans" | "condensed_sans" | string;
  weight?: "bold" | "extra_bold" | "black" | string;
};

export type TypographySpec = {
  preset?: TypographyPreset;
  position?: TypographyPosition;
  font?: TypographyFontStyle;
};

export type CoverTitleSpec = {
  // H1
  headline: string;
  // H2
  subline?: string;

  // Optional structured blocks.
  badge?: string;
  footer?: string;

  // Optional typography knobs.
  typography?: Partial<TypographySpec>;
};

export type BuildFinalPromptOptions = {
  // When provided, we treat this generation as an XHS cover and inject a strict title block.
  titleSpec?: CoverTitleSpec;
};

function normalizeTypographyPreset(raw: any): TypographyPreset | undefined {
  const v = typeof raw === "string" ? raw.trim() : raw;
  const n = typeof v === "number" ? v : Number(v);
  if (n === 2) return TypographyPreset.ListicleTutorial;
  if (n === 3) return TypographyPreset.Comparison;
  if (n === 6) return TypographyPreset.FeatureRelease;
  return undefined;
}

function defaultPositionForPreset(preset?: TypographyPreset): TypographyPosition {
  if (preset === TypographyPreset.Comparison) return "center";
  if (preset === TypographyPreset.FeatureRelease) return "bottom_center_in_card";
  return "top_left";
}

export function lintTypographySpec(
  input?: Partial<TypographySpec> | null,
  opts?: { defaultPreset?: TypographyPreset }
): TypographySpec | null {
  const hasSignal = Boolean(
    input
    && (input.preset != null || input.position != null || input.font != null)
  );

  const preset = normalizeTypographyPreset(input?.preset) || opts?.defaultPreset;
  if (!hasSignal && !preset) return null;

  const positionRaw = String(input?.position || "").trim() as TypographyPosition;
  const position: TypographyPosition = (positionRaw === "top_left" || positionRaw === "center" || positionRaw === "bottom_center_in_card")
    ? positionRaw
    : defaultPositionForPreset(preset);

  const font: TypographyFontStyle = {
    family: input?.font?.family || "sans",
    weight: input?.font?.weight || "black",
  };

  return {
    preset,
    position,
    font,
  };
}

function presetLabel(preset?: TypographyPreset): string {
  if (preset === TypographyPreset.ListicleTutorial) return "2 (listicle/tutorial)";
  if (preset === TypographyPreset.Comparison) return "3 (comparison)";
  if (preset === TypographyPreset.FeatureRelease) return "6 (feature release)";
  return "(unspecified)";
}

function placementLine(position: TypographyPosition): string {
  if (position === "top_left") {
    return "- Placement: top-left title zone; keep generous margins; ensure readability with a solid/gradient panel behind text.";
  }
  if (position === "center") {
    return "- Placement: centered title lockup; keep it large and clean; ensure readability with a solid/gradient panel behind text.";
  }
  return "- Placement: bottom-center INSIDE the main card (title block in-card); ensure readability with a solid/gradient panel behind text.";
}

function buildTitleSpecBlock(spec: CoverTitleSpec): string {
  const headline = String(spec?.headline || "").trim();
  if (!headline) return "";

  const subline = String(spec?.subline || "").trim();
  const badge = String(spec?.badge || "").trim();
  const footer = String(spec?.footer || "").trim();

  const wantsTypography = Boolean(spec?.typography || badge || footer);
  const typography = wantsTypography
    ? lintTypographySpec(spec?.typography || null, { defaultPreset: TypographyPreset.ListicleTutorial })
    : null;

  return [
    "TITLE_SPEC (must render these exact strings as readable Chinese text):",
    ...(typography
      ? [
        `- Typography preset: ${presetLabel(typography.preset)}`,
        `- Typography position: ${typography.position}`,
        `- Font style hint: family=${JSON.stringify(typography.font?.family || "sans")}, weight=${JSON.stringify(typography.font?.weight || "black")}`,
      ]
      : []),
    `- H1 (<=10 Chinese chars, bold sans, high contrast, NO punctuation): ${JSON.stringify(headline)}`,
    ...(subline ? [`- H2 (<=16 chars, optional): ${JSON.stringify(subline)}`] : ["- H2: (omit)"]),
    ...(badge ? [`- BADGE (<=8 chars, optional small label): ${JSON.stringify(badge)}`] : ["- BADGE: (omit)"]),
    ...(footer ? [`- FOOTER (<=12 chars, optional): ${JSON.stringify(footer)}`] : ["- FOOTER: (omit)"]),
    typography ? placementLine(typography.position) : "- Placement: a stable top title zone; use a solid/gradient panel behind text to guarantee readability.",
    "- Do not translate, do not rephrase, do not add extra words or symbols.",
    "- Avoid tiny text; prioritize large, clean typography.",
  ].join("\n");
}

function guessInsightTypeFromUrl(url: string): ReferenceImageInsight["type"] {
  const u = String(url || "").toLowerCase();
  if (/(^|[^a-z])logo([^a-z]|$)|wordmark|brand/.test(u)) return "logo";
  if (/ui|screenshot|screen|interface|app/.test(u)) return "screenshot";
  return "unknown";
}

// When a test harness provides explicit reference buckets (style/content/layout),
// we can bypass Vision analysis and still apply XHS template rules + constraints.
export function buildReferenceInsightsFromInputs(inputs: ExplicitReferenceInput[]): ReferenceImageInsight[] {
  if (!Array.isArray(inputs) || inputs.length === 0) return [];

  return inputs
    .map((input) => {
      const type = input?.type;
      const url = String(input?.url || "");
      if (!url) return null;

      const insightType = guessInsightTypeFromUrl(url);

      if (type === "style") {
        return {
          type: insightType,
          confidence: 0.9,
          bucket: "style",
          style_tags: [
            "Follow the style reference images as the primary aesthetic anchor (colors, lighting, materials, typography)",
            "Premium editorial / magazine-like cover aesthetic; clean, high-contrast typography",
          ],
          content_tags: [],
          layout_hints: ["Keep mobile-first hierarchy and generous margins; avoid clutter"],
        } satisfies ReferenceImageInsight;
      }

      if (type === "content") {
        return {
          type: insightType,
          confidence: 0.9,
          bucket: "content",
          style_tags: [],
          content_tags: [
            "Include the key visual elements from the content reference images (logo/UI/product/scene) where appropriate",
            "Do not distort logos; keep referenced UI clean and readable",
          ],
          layout_hints: ["Keep key elements inside the center safe area; leave breathing room"],
        } satisfies ReferenceImageInsight;
      }

      if (type === "layout") {
        return {
          type: insightType,
          confidence: 0.9,
          bucket: "style",
          style_tags: [],
          content_tags: [],
          layout_hints: [
            "Match the composition/layout of the layout reference images (blocks, spacing, alignment)",
            "Clear hierarchy: subject > headline > optional subline; avoid dense paragraphs",
          ],
        } satisfies ReferenceImageInsight;
      }

      // Untyped refs: treat as both-bucket generic hints so we can still inject XHS template rules.
      return {
        type: insightType,
        confidence: 0.6,
        bucket: "both",
        style_tags: ["Use the provided reference images to guide the overall visual style"],
        content_tags: ["Use the provided reference images as constraints for what elements to include"],
        layout_hints: ["Match the overall composition and text placement from the references"],
      } satisfies ReferenceImageInsight;
    })
    .filter(Boolean) as ReferenceImageInsight[];
}

function buildXhsCoverTemplate(
  insights: ReferenceImageInsight[],
  opts?: { richness?: "normal" | "rich" }
): string {
  // Keep this short; it is appended to the prompt.
  // Goal: enforce mobile readability while letting the model choose colors/backgrounds.
  const richness = opts?.richness || "normal";
  const hasScreenshot = insights.some((x) => x.type === "screenshot");
  const hasLogo = insights.some((x) => x.type === "logo");

  // Lightweight archetype selection hint.
  const allLayout = dedupe(insights.flatMap((x) => x.layout_hints || [])).join(" ").toLowerCase();
  const allContent = dedupe(insights.flatMap((x) => x.content_tags || [])).join(" ").toLowerCase();
  const combined = `${allLayout} ${allContent}`.trim();

  // Default hard-bias: editorial magazine cover. Only switch when the refs clearly indicate it.
  const comparisonSignal = /(before\s*\/?\s*after|before\s*and\s*after|对比|前后|a\s*\/\s*b|a\/b|ab对比|对照)/i.test(combined);
  const listicleSignal = /(清单|合集|listicle|\btop\s*\d+\b|\d+\s*(tips|ways|steps)|\d+\s*(招|步|个|条|点)|\d+\s*(个坑|坑点)|\d+\s*(要点|技巧)|\b\d+\s*step\b|步骤)/i.test(combined);

  let archetype = "editorial_magazine_cover";
  if (comparisonSignal) archetype = "split_panel_comparison";
  else if (listicleSignal) archetype = "big_number_listicle";

  const hints: string[] = [];
  if (hasLogo) {
    hints.push(
      "Prefer the brand mark placed inside the main card (aligned with headline/subline or in a clean footer zone); avoid tiny corner badges unless the reference clearly uses one; keep it high-contrast and undistorted."
    );
  }
  if (hasScreenshot) hints.push("If UI is referenced, show it as a clean device/mockup or window; keep text minimal and readable.");

  const richnessHints: string[] = [
    // Always enforce a safe definition of "richness" to avoid small paragraph text blocks.
    "Richness must NOT increase text density.",
    "Keep text density unchanged: still 1 headline + optional 1 subline; at most 1 short sticker/tag (optional). Prefer spacing and visual texture over extra copy.",
    "Allowed richness = at most: +1 sticker/tag (<=6 chars) +1 micro element (divider / dot-grid / tiny icon row).",
    "Forbidden richness = extra text blocks, paragraph text, tiny disclaimers, 3+ text areas.",
  ];
  if (richness === "rich") {
    richnessHints.unshift(
      "If user wants \"richer\": prefer premium materials/lighting/structure (paper grain, soft shadow, subtle border, micro-grid), not more text."
    );
  }

  return [
    "XHS_COVER_TEMPLATE (3:4, mobile-first):",
    `- Archetype: ${archetype} (hard default: editorial_magazine_cover; switch ONLY when refs clearly signal comparison/listicle)`,
    "- Hierarchy: subject > headline > sticker/tag (optional) > brand mark (small, inside card).",
    "- Text: MUST include 1 bold Chinese headline (<=10 chars). Optional 1 subline (<=16 chars). NO paragraph text blocks.",
    "- Readability: if unsure, use fewer words with very large type and a solid/gradient text zone to guarantee contrast.",
    "- Safe area: keep key text/face/logo within center ~80% with generous margins.",
    "- Color & background: choose a background that supports readability; may be dark/light/gradient/texture, but MUST keep headline/logo high-contrast (use an overlay panel behind text if needed).",
    "- Richness policy:",
    ...richnessHints.map((h) => `- ${h}`),
    ...(hints.length > 0 ? ["- Content-specific:", ...hints.map((h) => `- ${h}`)] : []),
  ].join("\n");
}

export function buildReferencePromptAugmentations(insights: ReferenceImageInsight[]): {
  xhsTemplate: string;
  styleAugment: string;
  contentAugment: string;
  negativeAugment: string;
  summary: {
    styleTagCount: number;
    contentTagCount: number;
    screenshotCount: number;
    logoCount: number;
  };
} {
  const styleTags: string[] = [];
  const contentTags: string[] = [];
  const layoutHints: string[] = [];

  let screenshotCount = 0;
  let logoCount = 0;

  for (const item of insights) {
    if (item.type === "screenshot") screenshotCount += 1;
    if (item.type === "logo") logoCount += 1;

    if (item.bucket === "style" || item.bucket === "both") {
      styleTags.push(...(item.style_tags || []));
      layoutHints.push(...(item.layout_hints || []));
    }

    if (item.bucket === "content" || item.bucket === "both") {
      contentTags.push(...(item.content_tags || []));
      layoutHints.push(...(item.layout_hints || []));
    }
  }

  const style = dedupe(styleTags).slice(0, 24);
  const content = dedupe(contentTags).slice(0, 24);
  const layout = dedupe(layoutHints).slice(0, 12);

  const styleAugment = style.length > 0
    ? [
      "STYLE_REFERENCE (apply to the overall look):",
      ...style.map((t) => `- ${t}`),
      ...(layout.length > 0 ? ["LAYOUT_HINTS:", ...layout.map((t) => `- ${t}`)] : []),
    ].join("\n")
    : "";

  const contentRules: string[] = [];
  if (screenshotCount > 0) {
    contentRules.push("If referencing UI/screenshots: keep UI layout clean; avoid garbled text; do not invent extra icons.");
  }
  if (logoCount > 0) {
    contentRules.push("If referencing a logo/brand mark: keep it simple, readable, and consistent in shape.");
  }

  const contentAugment = (content.length > 0 || contentRules.length > 0)
    ? [
      "CONTENT_REFERENCE (include these constraints):",
      ...content.map((t) => `- ${t}`),
      ...(contentRules.length > 0 ? ["CONTENT_RULES:", ...contentRules.map((t) => `- ${t}`)] : []),
    ].join("\n")
    : "";

  const negativeAugment = [
    "NEGATIVE (avoid):",
    "- watermark, signature, platform logo",
    "- low-resolution, artifacts, heavy noise",
    "- unreadable or gibberish text",
    "- extra unrelated logos or UI elements",
  ].join("\n");

  const xhsTemplate = buildXhsCoverTemplate(insights);

  return {
    xhsTemplate,
    styleAugment,
    contentAugment,
    negativeAugment,
    summary: {
      styleTagCount: style.length,
      contentTagCount: content.length,
      screenshotCount,
      logoCount,
    },
  };
}

export function buildFinalImagePrompt(
  basePrompt: string,
  insights: ReferenceImageInsight[],
  opts?: BuildFinalPromptOptions
): {
  prompt: string;
  basePromptHash: string;
  finalPromptHash: string;
  augmentationSummary: ReturnType<typeof buildReferencePromptAugmentations>["summary"];
} {
  const base = String(basePrompt || "").trim();
  const basePromptHash = sha256Hex(base);

  const normalizedInsights = Array.isArray(insights) ? insights : [];
  const titleSpecBlock = opts?.titleSpec ? buildTitleSpecBlock(opts.titleSpec) : "";

  // Keep existing behavior for non-cover, no-reference generations.
  if (normalizedInsights.length === 0 && !titleSpecBlock) {
    const finalPromptHash = sha256Hex(base);
    return {
      prompt: base,
      basePromptHash,
      finalPromptHash,
      augmentationSummary: {
        styleTagCount: 0,
        contentTagCount: 0,
        screenshotCount: 0,
        logoCount: 0,
      },
    };
  }

  const aug = buildReferencePromptAugmentations(normalizedInsights);

  // User intent hint: keep "rich" limited to small supporting cues, not dense text blocks.
  const rich = /内容丰富|信息丰富|更丰富|更饱满|多一些元素|细节多点/.test(base);
  const xhsTemplate = buildXhsCoverTemplate(normalizedInsights, { richness: rich ? "rich" : "normal" });

  const chunks = [
    base,
    xhsTemplate,
    titleSpecBlock,
    aug.styleAugment,
    aug.contentAugment,
    aug.negativeAugment,
  ].filter(Boolean);

  const prompt = chunks.join("\n\n");
  const finalPromptHash = sha256Hex(prompt);

  return {
    prompt,
    basePromptHash,
    finalPromptHash,
    augmentationSummary: aug.summary,
  };
}
