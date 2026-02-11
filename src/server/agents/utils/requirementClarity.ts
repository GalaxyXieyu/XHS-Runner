import { BaseMessage } from "@langchain/core/messages";

export interface RequirementClarityReport {
  score: number;
  level: "high" | "medium" | "low";
  missingDimensions: string[];
  normalizedRequirement: string;
  shouldSkipClarification: boolean;
}

const DIRECT_GENERATE_PATTERNS = [
  /直接生成/,
  /不用(再)?问/,
  /别问我/,
  /按默认/,
  /你自己发挥/,
];

const AUDIENCE_PATTERNS = [
  /适合.+(人|用户|群体|女生|男生|学生|新手|妈妈|宝妈|职场)/,
  /(面向|针对).+(人|用户|群体|新手|进阶)/,
  /(新手|学生党|上班族|宝妈|程序员|运营|创业者)/,
];

const GOAL_PATTERNS = [
  /(目标|目的|诉求|想要|希望|为了).{0,12}(涨粉|转化|收藏|评论|互动|种草|成交|教育)/,
  /(提升|增加|提高).{0,12}(收藏|评论|转化|点击|互动|销量)/,
  /(科普|教程|测评|避坑|清单|对比|复盘|经验)/,
];

const SCENARIO_PATTERNS = [
  /(场景|通勤|约会|办公室|居家|旅行|学生|职场|换季|夏天|冬天|周末)/,
  /(护肤|穿搭|减脂|健身|装修|摄影|编程|AI|学习|理财|副业)/,
  /(产品|品牌|功能|价格|预算|型号|服务)/,
];

const CONSTRAINT_PATTERNS = [
  /(字数|篇幅|结构|语气|口吻|风格|段落|标签|标题)/,
  /(专业|轻松|口语|干货|故事化|清单体|教程体)/,
  /(避免|不要|禁用|必须|一定要)/,
];

function normalizeRequirement(raw: string): string {
  return raw
    .replace(/^\s*\[当前主题ID:[^\]]+\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(patterns: RegExp[], input: string): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function buildMissingDimensions(input: string): string[] {
  const missing: string[] = [];

  if (!matchesAny(AUDIENCE_PATTERNS, input)) {
    missing.push("目标人群");
  }
  if (!matchesAny(GOAL_PATTERNS, input)) {
    missing.push("创作目标");
  }
  if (!matchesAny(SCENARIO_PATTERNS, input)) {
    missing.push("主题场景/核心对象");
  }
  if (!matchesAny(CONSTRAINT_PATTERNS, input)) {
    missing.push("风格或结构约束");
  }

  return missing;
}

export function extractLatestUserRequirement(messages: BaseMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as any;
    const type = typeof message?._getType === "function" ? message._getType() : message?.type;

    if (type !== "human") continue;

    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map((item: any) => (typeof item?.text === "string" ? item.text : ""))
            .join(" ")
        : "";

    if (content.trim()) {
      return normalizeRequirement(content);
    }
  }

  return "";
}

export function analyzeRequirementClarity(rawRequirement: string): RequirementClarityReport {
  const normalizedRequirement = normalizeRequirement(rawRequirement);
  const missingDimensions = buildMissingDimensions(normalizedRequirement);
  const shouldSkipClarification = DIRECT_GENERATE_PATTERNS.some((pattern) => pattern.test(normalizedRequirement));

  let score = 0;

  if (normalizedRequirement.length >= 18) score += 0.2;
  if (normalizedRequirement.length >= 40) score += 0.1;
  if (!missingDimensions.includes("目标人群")) score += 0.2;
  if (!missingDimensions.includes("创作目标")) score += 0.2;
  if (!missingDimensions.includes("主题场景/核心对象")) score += 0.2;
  if (!missingDimensions.includes("风格或结构约束")) score += 0.1;

  if (shouldSkipClarification) {
    score = Math.max(score, 0.75);
  }

  score = Math.max(0, Math.min(1, score));

  let level: RequirementClarityReport["level"] = "medium";
  if (score >= 0.75) {
    level = "high";
  } else if (score < 0.45) {
    level = "low";
  }

  return {
    score,
    level,
    missingDimensions,
    normalizedRequirement,
    shouldSkipClarification,
  };
}

export function buildClarificationAskUserArgs(report: RequirementClarityReport) {
  const topMissing = report.missingDimensions.slice(0, 3);
  const missingText = topMissing.length > 0 ? `（建议补充：${topMissing.join("、")}）` : "";

  const question = `为了提升内容质量，我建议先补充一点关键信息${missingText}。你希望怎么做？`;

  return {
    question,
    options: [
      {
        id: "continue_default",
        label: "按默认继续",
        description: "不补充细节，直接生成",
      },
      {
        id: "refine_requirements",
        label: "我来补充",
        description: "输入更具体的人群、目标、场景或风格",
      },
    ],
    selectionType: "single" as const,
    allowCustomInput: true,
    contextJson: JSON.stringify({
      __clarification: true,
      missingDimensions: report.missingDimensions,
      requirement: report.normalizedRequirement.slice(0, 400),
      clarityScore: Number(report.score.toFixed(2)),
      clarityLevel: report.level,
    }),
  };
}
