import assert from "node:assert";
import { END } from "@langchain/langgraph";
import { routeFromSupervisor } from "../../src/server/agents/routing/router";

function makeBaseState(overrides: Record<string, unknown>) {
  // We keep this intentionally minimal and cast to any because AgentState.State is a large shape.
  return {
    messages: [{ content: "" }],
    lastError: null,
    briefComplete: true,
    creativeBrief: { topic: "t" },
    evidenceComplete: true,
    referenceIntelligenceComplete: true,
    contentComplete: true,
    generatedContent: { body: "body" },
    layoutComplete: true,
    imagePlans: [{ sequence: 0, role: "cover", description: "d", prompt: "p" }],
    imagesComplete: true,
    fastMode: false,
    reviewFeedback: null,
    qualityScores: null,
    iterationCount: 0,
    maxIterations: 3,
    supervisorDecision: null,
    ...overrides,
  } as any;
}

function test(name: string, fn: () => void) {
  try {
    fn();
    process.stdout.write(`✔ ${name}\n`);
  } catch (err) {
    process.stdout.write(`✘ ${name}\n`);
    process.stdout.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  }
}

test("fastMode ends the workflow after imagesComplete", () => {
  const state = makeBaseState({ fastMode: true, reviewFeedback: null });
  const route = routeFromSupervisor(state);
  assert.strictEqual(route, END);
});

test("non-fastMode routes to review_agent when reviewFeedback is missing", () => {
  const state = makeBaseState({ fastMode: false, reviewFeedback: null });
  const route = routeFromSupervisor(state);
  assert.strictEqual(route, "review_agent");
});

test("fastMode does not skip image generation stage", () => {
  const state = makeBaseState({ fastMode: true, imagesComplete: false });
  const route = routeFromSupervisor(state);
  assert.strictEqual(route, "image_agent");
});

test("fastMode skips brief compiler and routes to research when evidence is missing", () => {
  const state = makeBaseState({
    fastMode: true,
    briefComplete: false,
    creativeBrief: null,
    evidenceComplete: false,
  });
  const route = routeFromSupervisor(state);
  assert.strictEqual(route, "research_agent");
});

test("fastMode routes to reference intelligence when reference is missing", () => {
  const state = makeBaseState({
    fastMode: true,
    referenceIntelligenceComplete: false,
  });
  const route = routeFromSupervisor(state);
  assert.strictEqual(route, "reference_intelligence_agent");
});
