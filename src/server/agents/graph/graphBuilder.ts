import { StateGraph, END, START } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state/agentState";
import {
  supervisorNode,
  briefCompilerNode,
  researchNode,
  referenceIntelligenceNode,
  layoutPlannerNode,
  writerAgentNode,
  imagePlannerNode,
  imageAgentNode,
  reviewAgentNode,
} from "../nodes";
import {
  routeFromSupervisor,
  shouldContinueSupervisor,
  shouldContinueResearch,
  shouldContinueImage,
  shouldContinueReview,
  shouldReturnToSupervisor,
} from "../routing";
import {
  researchTools,
  imageTools,
  askUserTool,
  referenceImageTools,
  promptTools,
  intentTools,
} from "../tools";
import { getCheckpointer } from "../utils";

export interface HITLConfig {
  enableHITL?: boolean;
  threadId?: string;
  langfuseSessionId?: string;
  langfuseTags?: string[];
}

// 自定义参考图工具节点
function createReferenceImageToolNode(baseToolNode: ToolNode) {
  return async (state: typeof AgentState.State) => {
    const referenceImages = state.referenceImages.length > 0
      ? state.referenceImages
      : (state.referenceImageUrl ? [state.referenceImageUrl] : []);

    // 支持多张参考图，传递给生成工具
    const fullReferenceImageUrls = referenceImages;
    const imageProvider = state.imageGenProvider || "gemini";

    const modifiedState = {
      ...state,
      messages: state.messages.map((msg) => {
        if (msg && "tool_calls" in msg && (msg as AIMessage).tool_calls?.length) {
          const aiMsg = msg as AIMessage;
          const modifiedToolCalls = aiMsg.tool_calls?.map((tc) => {
            if ((tc.name === "generate_with_reference" || tc.name === "generate_images_batch") && tc.args) {
              return {
                ...tc,
                args: {
                  ...tc.args,
                  referenceImageUrls: fullReferenceImageUrls,
                  provider: imageProvider,
                },
              };
            }
            return tc;
          });
          return new AIMessage({
            content: aiMsg.content,
            tool_calls: modifiedToolCalls,
          });
        }
        return msg;
      }),
    };

    const result = await baseToolNode.invoke(modifiedState);

    let newSuccessCount = 0;
    const newImagePaths: string[] = [];
    if (result.messages) {
      for (const msg of result.messages) {
        const content = typeof msg.content === "string" ? msg.content : "";
        if (/"success"\s*:\s*true/.test(content)) {
          newSuccessCount++;
          const pathMatch = content.match(/"path":"([^"]+)"/);
          if (pathMatch) {
            newImagePaths.push(pathMatch[1]);
          }
        }
      }
    }

    const totalGenerated = state.generatedImageCount + newSuccessCount;
    const plannedCount = state.imagePlans.length;
    const isComplete = totalGenerated >= plannedCount && plannedCount > 0;

    return {
      ...result,
      generatedImageCount: totalGenerated,
      generatedImagePaths: newImagePaths,
      imagesComplete: isComplete,
    };
  };
}

export async function buildGraph(model: ChatOpenAI, hitlConfig?: HITLConfig) {
  const researchToolNode = new ToolNode(researchTools);
  const imageToolNode = new ToolNode(imageTools);
  const supervisorToolNode = new ToolNode([...promptTools, ...intentTools, askUserTool]);
  const baseReferenceImageToolNode = new ToolNode(referenceImageTools);
  const referenceImageToolNode = createReferenceImageToolNode(baseReferenceImageToolNode);

  const workflow = new StateGraph(AgentState)
    // Supervisor
    .addNode("supervisor", (state) => supervisorNode(state, model))
    .addNode("supervisor_tools", supervisorToolNode)
    .addNode("supervisor_route", async () => ({}))

    // Core agents
    .addNode("brief_compiler_agent", (state) => briefCompilerNode(state, model))
    .addNode("research_agent", (state) => researchNode(state, model))
    .addNode("reference_intelligence_agent", referenceIntelligenceNode)
    .addNode("layout_planner_agent", (state) => layoutPlannerNode(state, model))
    .addNode("writer_agent", (state) => writerAgentNode(state, model))
    .addNode("image_planner_agent", (state) => imagePlannerNode(state, model))
    .addNode("image_agent", (state) => imageAgentNode(state, model))
    .addNode("review_agent", reviewAgentNode)

    // Tool nodes
    .addNode("research_tools", researchToolNode)
    .addNode("image_tools", imageToolNode)
    .addNode("reference_image_tools", referenceImageToolNode)

    // Entry
    .addConditionalEdges(START, shouldReturnToSupervisor, {
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })

    // Supervisor route
    .addConditionalEdges("supervisor", shouldContinueSupervisor, {
      supervisor_tools: "supervisor_tools",
      route: "supervisor_route",
    })
    .addConditionalEdges("supervisor_route", routeFromSupervisor, {
      brief_compiler_agent: "brief_compiler_agent",
      research_agent: "research_agent",
      reference_intelligence_agent: "reference_intelligence_agent",
      layout_planner_agent: "layout_planner_agent",
      writer_agent: "writer_agent",
      image_planner_agent: "image_planner_agent",
      image_agent: "image_agent",
      review_agent: "review_agent",
      [END]: END,
    })

    .addEdge("supervisor_tools", "supervisor")

    // New phase nodes
    .addConditionalEdges("brief_compiler_agent", shouldReturnToSupervisor, {
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })
    .addConditionalEdges("research_agent", shouldContinueResearch, {
      research_tools: "research_tools",
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })
    .addEdge("research_tools", "research_agent")
    .addConditionalEdges("reference_intelligence_agent", shouldReturnToSupervisor, {
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })
    .addConditionalEdges("layout_planner_agent", shouldReturnToSupervisor, {
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })

    // Writer
    .addConditionalEdges("writer_agent", shouldReturnToSupervisor, {
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })

    // Image planner
    .addConditionalEdges("image_planner_agent", shouldReturnToSupervisor, {
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })

    // Image
    .addConditionalEdges("image_agent", shouldContinueImage, {
      image_tools: "image_tools",
      reference_image_tools: "reference_image_tools",
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    })
    .addEdge("image_tools", "image_agent")
    .addEdge("reference_image_tools", "image_agent")

    // Review
    .addConditionalEdges("review_agent", shouldContinueReview, {
      [END]: END,
      supervisor: "supervisor",
      supervisor_route: "supervisor_route",
    });

  // Note: langgraph will throw if any node calls `interrupt()` without a checkpointer.
  // We compile with a checkpointer whenever we have a threadId (durable run), but only
  // enable actual pause/resume (interruptAfter) when HITL is enabled.
  if (hitlConfig?.threadId) {
    const checkpointer = await getCheckpointer();
    if (hitlConfig?.enableHITL) {
      return workflow.compile({
        checkpointer,
        interruptAfter: ["writer_agent", "image_planner_agent"],
      });
    }
    return workflow.compile({ checkpointer });
  }

  return workflow.compile();
}
