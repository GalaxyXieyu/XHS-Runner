/**
 * 统一用户确认工具 - Agent 在不确定时调用此工具向用户提问
 *
 * 设计灵感: Claude Code AskUserQuestion + LangGraph interrupt()
 * 核心理念: 一个工具替代所有确认场景
 */
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";

// 避免 tool 泛型在 TS5 上触发深度实例化（TS2589）导致编译极慢/卡死
const createTool = tool as any;

// 选项 Schema (简化以兼容 Gemini API)
const OptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});

export type AskUserOption = z.infer<typeof OptionSchema>;

// 用户响应类型
export interface UserResponse {
  selectedIds?: string[];
  customInput?: string;
  modifiedContext?: Record<string, unknown>;
}

// interrupt payload 类型
export interface AskUserInterrupt {
  type: "ask_user";
  question: string;
  options?: AskUserOption[];
  selectionType: "single" | "multiple" | "none";
  allowCustomInput: boolean;
  context?: Record<string, unknown>;
  timestamp: number;
}

// 工具输入 Schema (简化以兼容 Gemini API)
const askUserSchema = z.object({
  question: z.string().describe("向用户提出的问题"),
  options: z.array(OptionSchema).nullable().optional().describe("可选项列表"),
  selectionType: z.enum(["single", "multiple", "none"]).nullable()
    .describe("选择类型: single=单选, multiple=多选, none=仅文本输入，传 null 时默认 single"),
  allowCustomInput: z.boolean().nullable()
    .describe("是否允许用户输入自定义内容 (Others)，传 null 时默认 false"),
  contextJson: z.string().nullable().optional()
    .describe("附加上下文数据 (JSON 字符串格式)"),
});

/**
 * askUser 工具 - Agent 调用此工具向用户提问
 *
 * 使用场景:
 * 1. 确认生成结果 (图片规划、文案内容)
 * 2. 选择风格/模板 (单选 + 图片预览)
 * 3. 选择标签 (多选)
 * 4. 获取用户反馈 (纯文本输入)
 */
export const askUserTool = createTool(
  async ({ question, options, selectionType, allowCustomInput, contextJson }): Promise<UserResponse> => {
    // 解析 context JSON
    let context: Record<string, unknown> | undefined;
    if (contextJson) {
      try {
        context = JSON.parse(contextJson);
      } catch {
        context = { raw: contextJson };
      }
    }

    // 使用 LangGraph interrupt() 暂停工作流
    const userResponse = interrupt<AskUserInterrupt, UserResponse>({
      type: "ask_user",
      question,
      options,
      selectionType: selectionType || "single",
      allowCustomInput: allowCustomInput || false,
      context,
      timestamp: Date.now(),
    });

    return userResponse;
  },
  {
    name: "askUser",
    description: "当 Agent 需要用户确认、选择或输入时调用此工具。支持单选、多选、自定义输入。",
    schema: askUserSchema,
  }
);

// 导出工具数组
export const askUserTools = [askUserTool];
