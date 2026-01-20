import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentState, type AgentType, type ImagePlan } from "../state/agentState";
import { compressContext, safeSliceMessages } from "../utils";
import { getAgentPrompt } from "../../services/promptManager";
import { askUserTool } from "../tools";

export async function imagePlannerNode(state: typeof AgentState.State, model: ChatOpenAI) {
  const modelWithTools = model.bindTools([askUserTool]);

  const compressed = await compressContext(state, model);

  const styleAnalysis = state.styleAnalysis;
  const styleDesc = styleAnalysis?.description || "高质量小红书风格";
  const colorPalette = styleAnalysis?.colorPalette?.join("、") || "柔和自然色调";
  const mood = styleAnalysis?.mood || "精致高级";
  const lighting = styleAnalysis?.lighting || "柔和自然光";
  const reviewSuggestions = state.reviewFeedback?.suggestions?.join("\n") || "";

  const stateVariables = { styleDesc, colorPalette, mood, lighting, reviewSuggestions };

  const systemPrompt = await getAgentPrompt("image_planner_agent", stateVariables);
  if (!systemPrompt) {
    throw new Error("Prompt 'image_planner_agent' not found. Please create it in Langfuse: xhs-agent-image_planner_agent");
  }

  const response = await modelWithTools.invoke([
    new HumanMessage(systemPrompt),
    ...safeSliceMessages(compressed.messages, 15),
  ]);

  // 解析规划结果
  const content = typeof response.content === "string" ? response.content : "";
  let plans: ImagePlan[] = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      plans = JSON.parse(jsonMatch[0]);
    }
  } catch {
    plans = [
      { sequence: 0, role: "cover", description: "封面图", prompt: `精美封面，${styleDesc}风格，${colorPalette}色调，${mood}氛围，竖版构图，3:4比例，小红书封面风格` },
      { sequence: 1, role: "detail", description: "内容详情图", prompt: `内容展示，${styleDesc}风格，${colorPalette}色调，${mood}氛围，竖版构图，3:4比例，小红书风格` },
    ];
  }

  if (plans.length > 4) {
    plans = plans.slice(0, 4);
  }

  plans = plans.map(p => {
    const styleType = p.role === 'cover' ? '小红书封面风格' : '小红书配图风格';
    return {
      ...p,
      prompt: p.prompt || `${p.description}，${styleDesc}风格，${colorPalette}色调，${mood}氛围，竖版构图，3:4比例，${styleType}，高清精致`
    };
  });

  return {
    messages: [response],
    currentAgent: "image_planner_agent" as AgentType,
    imagePlans: plans,
    reviewFeedback: null,
    imagesComplete: false,
    summary: compressed.summary,
  };
}
