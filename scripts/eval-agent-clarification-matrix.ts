/**
 * 评估各节点是否具备主动 ask_user 能力（通过状态构造快速命中目标节点）。
 *
 * 用法：
 * npx tsx scripts/eval-agent-clarification-matrix.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { HumanMessage } from "@langchain/core/messages";
import { INTERRUPT } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import { createMultiAgentSystem } from "../src/server/agents/multiAgentSystem";

interface Scenario {
  id: string;
  targetAgent: string;
  description: string;
  state: Record<string, unknown>;
}

const CLEAR_MESSAGE = "面向新手用户写一篇AI工具避坑指南，目标提升收藏，语气口语化，3段结构";

function baseState(threadId: string): Record<string, unknown> {
  return {
    messages: [new HumanMessage(CLEAR_MESSAGE)],
    threadId,
    clarificationRounds: 1,
    briefComplete: true,
    evidenceComplete: true,
    referenceIntelligenceComplete: true,
    contentComplete: true,
    layoutComplete: true,
    imagesComplete: false,
    generatedContent: {
      title: "示例标题",
      body: "第一段：开场。\n\n第二段：方法。\n\n第三段：总结。",
      tags: ["AI", "避坑"],
    },
    imagePlans: [{ sequence: 0, role: "cover", description: "封面图", prompt: "clean style" }],
    paragraphImageBindings: [{ imageSeq: 0, paragraphIds: ["p1"], rationale: "cover" }],
    reviewFeedback: { approved: true, suggestions: [] },
    qualityScores: {
      scores: {
        infoDensity: 0.8,
        textImageAlignment: 0.8,
        styleConsistency: 0.8,
        readability: 0.8,
        platformFit: 0.8,
      },
      overall: 0.8,
      failReasons: [],
    },
  };
}

function buildScenarios(threadId: string): Scenario[] {
  const base = baseState(threadId);

  return [
    {
      id: "brief",
      targetAgent: "brief_compiler_agent",
      description: "brief 阶段低清晰度触发澄清",
      state: {
        ...base,
        messages: [new HumanMessage("写一篇关于咖啡的小红书")],
        clarificationRounds: 1,
        briefComplete: false,
      },
    },
    {
      id: "research",
      targetAgent: "research_agent",
      description: "研究阶段缺少方向触发澄清",
      state: {
        ...base,
        creativeBrief: { audience: "", goal: "", keyPoints: [], callToAction: "", bannedExpressions: [], tone: "" },
        evidenceComplete: false,
      },
    },
    {
      id: "reference_intelligence",
      targetAgent: "reference_intelligence_agent",
      description: "无参考图触发风格来源澄清",
      state: {
        ...base,
        referenceIntelligenceComplete: false,
        referenceInputs: [],
        referenceImages: [],
      },
    },
    {
      id: "writer",
      targetAgent: "writer_agent",
      description: "写作阶段证据不足触发澄清",
      state: {
        ...base,
        contentComplete: false,
        evidencePack: null,
      },
    },
    {
      id: "layout",
      targetAgent: "layout_planner_agent",
      description: "版式偏好触发澄清",
      state: {
        ...base,
        layoutComplete: false,
        layoutPreference: "balanced",
        referenceAnalyses: [],
      },
    },
    {
      id: "image_planner",
      targetAgent: "image_planner_agent",
      description: "缺少 layoutSpec 触发澄清",
      state: {
        ...base,
        imagePlans: [],
        paragraphImageBindings: [],
        layoutSpec: [],
      },
    },
    {
      id: "image",
      targetAgent: "image_agent",
      description: "图片阶段无参考风格触发澄清",
      state: {
        ...base,
        imagesComplete: false,
        referenceImages: [],
        referenceAnalyses: [],
      },
    },
    {
      id: "review",
      targetAgent: "review_agent",
      description: "无图片时审核触发澄清",
      state: {
        ...base,
        imagesComplete: true,
        reviewFeedback: null,
        generatedImagePaths: [],
      },
    },
  ];
}

async function captureFirstAgentClarification(
  app: Awaited<ReturnType<typeof createMultiAgentSystem>>,
  scenario: Scenario,
  threadId: string
): Promise<string | null> {
  const stream = await app.stream(scenario.state as any, {
    recursionLimit: 40,
    streamMode: ["updates"] as any,
    configurable: { thread_id: threadId },
  });

  for await (const [mode, chunk] of stream as AsyncIterable<[string, any]>) {
    if (mode !== "updates") continue;
    if (!chunk || typeof chunk !== "object" || !(INTERRUPT in chunk)) continue;

    const interruptData = (chunk as any)[INTERRUPT]?.[0]?.value;
    if (!interruptData || typeof interruptData !== "object") continue;
    if ((interruptData as any).type !== "ask_user") continue;

    const context = (interruptData as any).context || {};
    if (context.__agent_clarification) {
      return String(context.agent || "");
    }

    return "NON_AGENT_ASK";
  }

  return null;
}

async function main() {
  console.log("🎯 Agent 澄清能力矩阵评估\n");

  const results: Array<{ id: string; target: string; got: string | null; pass: boolean; description: string }> = [];

  for (const template of buildScenarios("template")) {
    const threadId = uuidv4();
    const app = await createMultiAgentSystem({ enableHITL: true, threadId });
    const scenario: Scenario = {
      ...template,
      state: {
        ...template.state,
        threadId,
      },
    };

    process.stdout.write(`▶ ${scenario.id} (${scenario.description}) ... `);

    try {
      const got = await captureFirstAgentClarification(app, scenario, threadId);
      const pass = got === scenario.targetAgent;
      results.push({ id: scenario.id, target: scenario.targetAgent, got, pass, description: scenario.description });
      process.stdout.write(pass ? "PASS\n" : `FAIL (got=${got || "none"})\n`);
    } catch (error) {
      results.push({ id: scenario.id, target: scenario.targetAgent, got: "ERROR", pass: false, description: scenario.description });
      process.stdout.write(`ERROR (${error instanceof Error ? error.message : String(error)})\n`);
    }
  }

  const passCount = results.filter((item) => item.pass).length;
  console.log("\n📊 结果统计");
  console.log(`- 通过: ${passCount}/${results.length}`);

  const failed = results.filter((item) => !item.pass);
  if (failed.length > 0) {
    console.log("\n❌ 未通过项");
    failed.forEach((item) => {
      console.log(`- ${item.id}: 期望=${item.target}, 实际=${item.got || "none"}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("脚本执行失败:", error);
  process.exit(1);
});
