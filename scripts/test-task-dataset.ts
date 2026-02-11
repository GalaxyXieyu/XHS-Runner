import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function test() {
  console.log("=== Test task dataset records ===\\n");

  const agents = [
    "supervisor",
    "brief_compiler_agent",
    "research_agent",
    "reference_intelligence_agent",
    "layout_planner_agent",
    "writer_agent",
    "image_planner_agent",
    "image_agent",
    "review_agent",
  ];

  const secretKey = "sk-lf-06b6705e-432e-4302-8f33-a15f0da524dd";
  const publicKey = "pk-lf-4d9cfa8e-aeda-4859-b8a5-57081a7143fe";
  const baseUrl = "http://localhost:23022";
  const auth = Buffer.from(publicKey + ":" + secretKey).toString("base64");

  const response = await fetch(baseUrl + "/api/public/datasets", {
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/json",
    },
  });

  if (response.ok) {
    const data = await response.json();
    const datasets = data.data || [];

    console.log("Found " + datasets.length + " datasets:\\n");

    agents.forEach((agent) => {
      const datasetName = "xhs-dataset-" + agent;
      const exists = datasets.some((d: any) => d.name === datasetName);
      console.log("  " + (exists ? "OK" : "MISS") + " " + datasetName);
    });
  } else {
    console.error("Query failed:", await response.text());
  }
}

test().catch(console.error);
