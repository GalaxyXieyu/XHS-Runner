/**
 * 快速测试路由逻辑，不需要调用 LLM
 */
import { HumanMessage } from "@langchain/core/messages";

// Mock state 类型
interface MockState {
  messages: any[];
  researchComplete: boolean;
  contentComplete: boolean;
  referenceImageUrl: string | null;
  referenceImages: string[];
  styleAnalysis: any;
  imagePlans: any[];
  imagesComplete: boolean;
  reviewFeedback: any;
  iterationCount: number;
  maxIterations: number;
  generatedImageCount: number;
}

// 简化版路由逻辑（从 router.ts 复制）
function routeFromSupervisor(state: MockState): string {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = lastMessage && typeof lastMessage.content === "string" ? lastMessage.content : "";

  console.log("\n[DEBUG] routeFromSupervisor - state:");
  console.log("  imagesComplete:", state.imagesComplete);
  console.log("  reviewFeedback:", state.reviewFeedback);
  console.log("  imagePlans.length:", state.imagePlans.length);
  console.log("  generatedImageCount:", state.generatedImageCount);

  // 默认流程
  const hasReferenceImage = state.referenceImageUrl || state.referenceImages.length > 0;
  const needsResearch = !state.researchComplete;
  const needsStyle = hasReferenceImage && !state.styleAnalysis;

  if (needsResearch) return "research_agent";
  if (needsStyle) return "style_analyzer_agent";
  if (!state.contentComplete) return "writer_agent";
  if (state.imagePlans.length === 0) return "image_planner_agent";
  if (!state.imagesComplete) return "image_agent";
  if (!state.reviewFeedback) return "review_agent";

  // 审核未通过但未达到迭代上限
  if (state.reviewFeedback && !state.reviewFeedback.approved) {
    if (state.iterationCount < state.maxIterations && state.reviewFeedback.targetAgent) {
      return state.reviewFeedback.targetAgent;
    }
    return "END";
  }
  return "END";
}

// 测试用例
const testCases: { name: string; state: MockState; expected: string }[] = [
  {
    name: "图片已完成，应该去 review_agent",
    state: {
      messages: [new HumanMessage("test")],
      researchComplete: true,
      contentComplete: true,
      referenceImageUrl: null,
      referenceImages: [],
      styleAnalysis: null,
      imagePlans: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }],
      imagesComplete: true,
      reviewFeedback: null,
      iterationCount: 0,
      maxIterations: 3,
      generatedImageCount: 4,
    },
    expected: "review_agent",
  },
  {
    name: "图片未完成，应该去 image_agent",
    state: {
      messages: [new HumanMessage("test")],
      researchComplete: true,
      contentComplete: true,
      referenceImageUrl: null,
      referenceImages: [],
      styleAnalysis: null,
      imagePlans: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }],
      imagesComplete: false,
      reviewFeedback: null,
      iterationCount: 0,
      maxIterations: 3,
      generatedImageCount: 2,
    },
    expected: "image_agent",
  },
  {
    name: "审核通过，应该 END",
    state: {
      messages: [new HumanMessage("test")],
      researchComplete: true,
      contentComplete: true,
      referenceImageUrl: null,
      referenceImages: [],
      styleAnalysis: null,
      imagePlans: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }],
      imagesComplete: true,
      reviewFeedback: { approved: true, suggestions: [] },
      iterationCount: 1,
      maxIterations: 3,
      generatedImageCount: 4,
    },
    expected: "END",
  },
  {
    name: "审核未通过，应该重新生成",
    state: {
      messages: [new HumanMessage("test")],
      researchComplete: true,
      contentComplete: true,
      referenceImageUrl: null,
      referenceImages: [],
      styleAnalysis: null,
      imagePlans: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }, { sequence: 4 }],
      imagesComplete: true,
      reviewFeedback: { approved: false, suggestions: ["图片不够清晰"], targetAgent: "image_agent" },
      iterationCount: 1,
      maxIterations: 3,
      generatedImageCount: 4,
    },
    expected: "image_agent",
  },
];

// 运行测试
console.log("=== 路由逻辑测试 ===\n");

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = routeFromSupervisor(tc.state);
  const ok = result === tc.expected;

  if (ok) {
    console.log(`✅ ${tc.name}`);
    console.log(`   结果: ${result}`);
    passed++;
  } else {
    console.log(`❌ ${tc.name}`);
    console.log(`   期望: ${tc.expected}`);
    console.log(`   实际: ${result}`);
    failed++;
  }
  console.log("");
}

console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===`);
