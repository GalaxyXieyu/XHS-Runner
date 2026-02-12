/**
 * 评估 supervisor 前置澄清能力
 *
 * 用法：
 * npx tsx scripts/eval-supervisor-clarification.ts
 * npx tsx scripts/eval-supervisor-clarification.ts --baseUrl=http://localhost:3000 --themeId=1
 */

export {};

type Expectation = "clarify" | "no_clarify";

interface EvalCase {
  id: string;
  message: string;
  expected: Expectation;
  note: string;
}

interface CaseResult {
  id: string;
  expected: Expectation;
  askedClarification: boolean;
  askQuestion?: string;
  firstNode?: string;
  supervisorDecisions: string[];
  pass: boolean;
  error?: string;
}

const DEFAULT_CASES: EvalCase[] = [
  {
    id: "ambiguous-1",
    message: "写一篇关于咖啡的小红书",
    expected: "clarify",
    note: "主题宽泛，缺少受众/目标/场景",
  },
  {
    id: "ambiguous-2",
    message: "帮我写个护肤笔记",
    expected: "clarify",
    note: "仅有主题，无明确对象和约束",
  },
  {
    id: "clear-1",
    message: "面向油痘肌大学生写一篇平价防晒避坑笔记，目标提升收藏，语气口语化，正文3段，附8个标签",
    expected: "no_clarify",
    note: "需求明确，信息充分",
  },
  {
    id: "clear-2",
    message: "针对30岁职场女性写抗老精华对比，强调早晚使用场景，目标提升评论互动，风格专业但不生硬",
    expected: "no_clarify",
    note: "有受众/目标/场景/风格",
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = args.find((item) => item.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const baseUrl = getArg("baseUrl") || "http://localhost:3000";
  const themeIdRaw = getArg("themeId");
  const themeId = themeIdRaw ? Number(themeIdRaw) : undefined;
  const timeoutMsRaw = getArg("timeoutMs");
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : 90000;

  return {
    baseUrl,
    themeId: Number.isFinite(themeId as number) ? themeId : undefined,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 90000,
  };
}

async function evaluateCase(
  baseUrl: string,
  themeId: number | undefined,
  testCase: EvalCase,
  timeoutMs: number
): Promise<CaseResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const payload: Record<string, unknown> = {
    message: testCase.message,
    enableHITL: true,
  };
  if (typeof themeId === "number") {
    payload.themeId = themeId;
  }

  const res = await fetch(`${baseUrl}/api/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  if (!res.ok || !res.body) {
    return {
      id: testCase.id,
      expected: testCase.expected,
      askedClarification: false,
      supervisorDecisions: [],
      pass: false,
      error: `HTTP ${res.status}`,
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let askedClarification = false;
  let askQuestion = "";
  let firstNode = "";
  const supervisorDecisions: string[] = [];

  // 最多读取 250 条事件，避免卡住。
  let eventCounter = 0;

  try {
    readLoop: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        const line = chunk.split("\n").find((item) => item.startsWith("data: "));
        if (!line) continue;

        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;

        let event: any;
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }

        eventCounter += 1;

        if (!firstNode && event.type === "agent_start" && typeof event.agent === "string") {
          firstNode = event.agent;
        }

        if (event.type === "supervisor_decision" && typeof event.decision === "string") {
          supervisorDecisions.push(event.decision);
        }

        if (event.type === "ask_user") {
          askedClarification = true;
          askQuestion = typeof event.question === "string" ? event.question : "";
          break readLoop;
        }

        if (event.type === "agent_start" && typeof event.agent === "string") {
          const isSupervisorStage = event.agent === "supervisor" || event.agent === "supervisor_route";
          if (!isSupervisorStage) {
            // 一旦进入非 supervisor 阶段且还没 ask_user，说明没有前置澄清。
            break readLoop;
          }
        }

        if (event.type === "workflow_complete") {
          break readLoop;
        }

        if (eventCounter >= 250) {
          break readLoop;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
    controller.abort();
  }

  const expectedClarification = testCase.expected === "clarify";
  const pass = expectedClarification === askedClarification;

  return {
    id: testCase.id,
    expected: testCase.expected,
    askedClarification,
    askQuestion,
    firstNode,
    supervisorDecisions,
    pass,
  };
}

async function main() {
  const { baseUrl, themeId, timeoutMs } = parseArgs();

  console.log("🎯 Supervisor 澄清评估开始");
  console.log(`- Base URL: ${baseUrl}`);
  console.log(`- Theme ID: ${typeof themeId === "number" ? themeId : "(未指定)"}`);
  console.log(`- Timeout: ${timeoutMs}ms`);
  console.log(`- Case 数量: ${DEFAULT_CASES.length}\n`);

  const results: CaseResult[] = [];

  for (const testCase of DEFAULT_CASES) {
    process.stdout.write(`▶ ${testCase.id} (${testCase.note}) ... `);

    try {
      const result = await evaluateCase(baseUrl, themeId, testCase, timeoutMs);
      results.push(result);
      process.stdout.write(result.pass ? "PASS\n" : "FAIL\n");
    } catch (error) {
      results.push({
        id: testCase.id,
        expected: testCase.expected,
        askedClarification: false,
        supervisorDecisions: [],
        pass: false,
        error: error instanceof Error ? error.message : String(error),
      });
      process.stdout.write("ERROR\n");
    }
  }

  const total = results.length;
  const passCount = results.filter((item) => item.pass).length;
  const clarifyExpected = results.filter((item) => item.expected === "clarify");
  const clarifyHit = clarifyExpected.filter((item) => item.askedClarification).length;
  const clarifyRate = clarifyExpected.length > 0 ? clarifyHit / clarifyExpected.length : 0;

  const noClarifyExpected = results.filter((item) => item.expected === "no_clarify");
  const falsePositive = noClarifyExpected.filter((item) => item.askedClarification).length;
  const falsePositiveRate = noClarifyExpected.length > 0 ? falsePositive / noClarifyExpected.length : 0;

  console.log("\n📊 评估结果");
  console.log(`- 通过率: ${passCount}/${total} (${Math.round((passCount / Math.max(total, 1)) * 100)}%)`);
  console.log(`- 澄清命中率(应澄清): ${clarifyHit}/${clarifyExpected.length} (${Math.round(clarifyRate * 100)}%)`);
  console.log(`- 误触发率(不应澄清): ${falsePositive}/${noClarifyExpected.length} (${Math.round(falsePositiveRate * 100)}%)`);

  const failed = results.filter((item) => !item.pass);
  if (failed.length > 0) {
    console.log("\n❌ 失败用例");
    for (const item of failed) {
      console.log(`- ${item.id}: expected=${item.expected}, asked=${item.askedClarification}, firstNode=${item.firstNode || "n/a"}`);
      if (item.error) {
        console.log(`  error=${item.error}`);
      }
      if (item.askQuestion) {
        console.log(`  askQuestion=${item.askQuestion}`);
      }
      if (item.supervisorDecisions.length > 0) {
        console.log(`  decisions=${item.supervisorDecisions.join(" -> ")}`);
      }
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("脚本执行失败:", error);
  process.exit(1);
});
