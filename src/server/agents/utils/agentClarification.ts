import { HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { AgentState } from "../state/agentState";
import type { AskUserOption, AskUserInterrupt, UserResponse } from "../tools/askUserTool";

interface AgentClarificationRequest {
  key: string;
  agent: string;
  question: string;
  options?: AskUserOption[];
  selectionType?: "single" | "multiple" | "none";
  allowCustomInput?: boolean;
  context?: Record<string, unknown>;
}

interface AgentClarificationResult {
  messages: HumanMessage[];
  agentClarificationKeys: string[];
}

function buildResponseText(
  userResponse: UserResponse,
  options: AskUserOption[]
): string {
  if (userResponse.customInput?.trim()) {
    return userResponse.customInput.trim();
  }

  if (Array.isArray(userResponse.selectedIds) && userResponse.selectedIds.length > 0) {
    const labels = options
      .filter((item) => userResponse.selectedIds?.includes(item.id))
      .map((item) => item.label)
      .filter(Boolean);

    if (labels.length > 0) {
      return `选择：${labels.join("、")}`;
    }

    return `选择：${userResponse.selectedIds.join("、")}`;
  }

  return "按默认继续";
}

export function requestAgentClarification(
  state: typeof AgentState.State,
  request: AgentClarificationRequest
): AgentClarificationResult | null {
  if (!state.threadId) {
    return null;
  }

  const existingKeys = state.agentClarificationKeys || [];
  if (existingKeys.includes(request.key)) {
    return null;
  }

  const options = request.options || [];

  const userResponse = interrupt<AskUserInterrupt, UserResponse>({
    type: "ask_user",
    question: request.question,
    options,
    selectionType: request.selectionType || "single",
    allowCustomInput: request.allowCustomInput ?? true,
    context: {
      __agent_clarification: true,
      agent: request.agent,
      key: request.key,
      ...(request.context || {}),
    },
    timestamp: Date.now(),
  });

  const responseText = buildResponseText(userResponse, options);

  return {
    messages: [new HumanMessage(`【用户补充-${request.agent}】${responseText}`)],
    agentClarificationKeys: [...existingKeys, request.key],
  };
}
