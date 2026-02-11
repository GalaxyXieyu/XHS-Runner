import { config } from "dotenv";
import { resolve } from "path";
import { getOrCreateDataset, addDatasetItem } from "../src/server/services/langfuseService";

config({ path: resolve(process.cwd(), ".env.local") });

const ALL_AGENTS = [
  "supervisor",
  "supervisor_route",
  "brief_compiler_agent",
  "research_agent",
  "reference_intelligence_agent",
  "layout_planner_agent",
  "research_tools",
  "writer_agent",
  "image_planner_agent",
  "image_agent",
  "review_agent",
];

async function testAllAgents() {
  console.log("=== Test all Agent datasets ===\\n");

  for (const agentName of ALL_AGENTS) {
    console.log("Testing " + agentName + "...");

    try {
      const datasetName = await getOrCreateDataset(agentName);
      if (!datasetName) {
        console.log("  FAIL: dataset create failed\\n");
        continue;
      }
      console.log("  OK: dataset " + datasetName);

      await addDatasetItem({
        agentName,
        input: { test: true, agent: agentName },
        output: { success: true },
        metadata: { test: true, timestamp: new Date().toISOString() },
      });
      console.log("  OK: item added\\n");
    } catch (error) {
      console.error("  FAIL:", error);
      console.log("");
    }
  }

  console.log("=== Expected datasets ===");
  ALL_AGENTS.forEach((agent) => console.log("  - xhs-dataset-" + agent));
}

testAllAgents().catch(console.error);
