/**
 * 通用 SSE 流处理器
 * 消除 AgentCreator 中重复的流处理逻辑
 *
 * 功能：
 * - 统一的事件处理逻辑
 * - 连接超时检测
 * - 自动重试机制
 */

import type { AgentEvent, ChatMessage, ImageTask, AskUserDialogState } from "../types";

// 默认配置
const DEFAULT_TIMEOUT_MS = 420000; // 420秒超时（7分钟，multi-agent 工作流 + 图片生成需要较长时间）
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

interface ProcessEventMemory {
  imageProgressBuckets: Map<number, string>;
}

// 从 URL 中提取 asset ID
export function extractAssetId(url: string): number {
  const match = url.match(/\/api\/assets\/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  const numMatch = url.match(/^\d+$/);
  if (numMatch) {
    return parseInt(url, 10);
  }
  return parseInt(url, 10) || 0;
}

export interface StreamProcessorCallbacks {
  // 状态更新
  setEvents: React.Dispatch<React.SetStateAction<AgentEvent[]>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setImageTasks: React.Dispatch<React.SetStateAction<ImageTask[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamPhase: React.Dispatch<React.SetStateAction<string>>;
  setAskUserDialog: React.Dispatch<React.SetStateAction<AskUserDialogState>>;

  // 可选回调
  updatePhase?: (event: AgentEvent) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onConversationId?: (id: number) => void;
}

export interface StreamProcessorOptions {
  /** 是否在 handleSubmit 中使用（会重置 events） */
  resetEvents?: boolean;
  /** 流处理来源标识（用于日志） */
  source?: string;
  /** 超时时间（毫秒），默认 60000ms */
  timeoutMs?: number;
  /** 最大重试次数，默认 2 次 */
  maxRetries?: number;
  /** 重试延迟（毫秒），默认 1000ms */
  retryDelayMs?: number;
  /** AbortController 用于取消请求 */
  abortController?: AbortController;
}

function formatPercent(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `${Math.round(Math.max(0, Math.min(1, num)) * 100)}分`;
}

function formatStructuredEventLine(event: AgentEvent): string | null {
  if (event.type === "brief_ready") {
    const brief = (event as any).brief || {};
    const audience = brief.targetAudience || brief.audience;
    const goal = brief.goal || brief.objective;
    const meta = [audience ? `受众：${audience}` : "", goal ? `目标：${goal}` : ""]
      .filter(Boolean)
      .join("，");
    return `${event.content || "创作 Brief 已生成"}${meta ? `（${meta}）` : ""}`;
  }

  if (event.type === "layout_spec_ready") {
    const count = Array.isArray((event as any).layoutSpec) ? (event as any).layoutSpec.length : 0;
    return `${event.content || "版式规划完成"}${count ? `，共 ${count} 张` : ""}`;
  }

  if (event.type === "alignment_map_ready") {
    const bindingCount = Array.isArray((event as any).paragraphImageBindings)
      ? (event as any).paragraphImageBindings.length
      : 0;
    const bodyCount = Array.isArray((event as any).bodyBlocks) ? (event as any).bodyBlocks.length : 0;
    return `${event.content || "段落映射完成"}${bindingCount ? `，映射 ${bindingCount} 条` : ""}${bodyCount ? `，段落 ${bodyCount} 个` : ""}`;
  }

  if (event.type === "quality_score") {
    const quality = (event as any).qualityScores || {};
    const scores = quality.scores || {};
    return [
      `审核评分：总分 ${formatPercent(quality.overall)}`,
      `信息密度 ${formatPercent(scores.infoDensity)} / 图文一致 ${formatPercent(scores.textImageAlignment)}`,
      `风格一致 ${formatPercent(scores.styleConsistency)} / 可读性 ${formatPercent(scores.readability)} / 平台适配 ${formatPercent(scores.platformFit)}`,
    ].join("\n");
  }

  return null;
}

function syncAssistantMessage(
  assistantContent: { current: string },
  collectedEvents: AgentEvent[],
  callbacks: StreamProcessorCallbacks
): void {
  callbacks.setMessages((prev) => {
    const newMessages = [...prev];
    const lastMsg = newMessages[newMessages.length - 1];

    if (lastMsg?.role === "assistant") {
      lastMsg.content = assistantContent.current;
      lastMsg.events = [...collectedEvents];
    } else {
      newMessages.push({
        role: "assistant",
        content: assistantContent.current,
        events: [...collectedEvents],
      });
    }

    return newMessages;
  });
}

function appendAssistantLine(
  line: string,
  assistantContent: { current: string },
  collectedEvents: AgentEvent[],
  callbacks: StreamProcessorCallbacks
): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  assistantContent.current = assistantContent.current
    ? `${assistantContent.current}\n${trimmed}`
    : trimmed;

  syncAssistantMessage(assistantContent, collectedEvents, callbacks);
}

/**
 * 处理 SSE 流中的单个事件
 */
export function processStreamEvent(
  event: AgentEvent,
  collectedEvents: AgentEvent[],
  assistantContent: { current: string },
  callbacks: StreamProcessorCallbacks,
  options: StreamProcessorOptions = {},
  memory: ProcessEventMemory = { imageProgressBuckets: new Map<number, string>() }
): void {
  const { source = "unknown" } = options;

  // 更新阶段提示
  callbacks.updatePhase?.(event);

  // 提取 conversationId（从首个 agent_start 事件）
  if (event.type === "agent_start" && (event as any).conversationId) {
    callbacks.onConversationId?.((event as any).conversationId);
  }

  // 收集批量图片生成任务
  if (event.type === "tool_result" && event.tool === "generate_images" && event.taskIds && event.prompts) {
    const newTasks: ImageTask[] = event.taskIds.map((id, i) => ({
      id,
      prompt: event.prompts![i] || "",
      status: "queued" as const,
    }));
    callbacks.setImageTasks((prev) => [...prev, ...newTasks]);
  }

  // 处理消息
  if (event.type === "message" && event.content) {
    assistantContent.current += (assistantContent.current ? "\n\n" : "") + event.content;
    syncAssistantMessage(assistantContent, collectedEvents, callbacks);
  }

  // 处理进度事件
  if (event.type === "progress" && event.content) {
    callbacks.setMessages((prev) => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg?.role === "assistant") {
        lastMsg.events = [...collectedEvents];
      }
      return newMessages;
    });
  }

  // 处理 ask_user 事件
  // 只打开弹窗，不立即添加消息到对话流
  // 用户确认后由 handleAskUserSubmit 添加问答记录
  if (event.type === "ask_user" && event.question) {
    callbacks.setAskUserDialog({
      isOpen: true,
      question: event.question,
      options: event.options || [],
      selectionType: event.selectionType || "single",
      allowCustomInput: event.allowCustomInput || false,
      threadId: event.threadId || "",
      context: (event as any).context || {},
      selectedIds: [],
      customInput: "",
    });
  }

  // 处理 workflow_paused 事件
  if (event.type === "workflow_paused") {
    console.log(`[${source}] 收到 workflow_paused 事件，设置 isStreaming = false`);
    callbacks.setIsStreaming(false);
    callbacks.setStreamPhase("");
  }

  // 处理 image_progress 事件
  if (event.type === "image_progress") {
    const imgEvent = event as any;
    callbacks.setImageTasks((prev) => {
      const existingIndex = prev.findIndex((t) => t.id === imgEvent.taskId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          status: imgEvent.status === "complete" ? "done" : imgEvent.status,
          ...(imgEvent.url && { assetId: extractAssetId(imgEvent.url) }),
          ...(imgEvent.errorMessage && { errorMessage: imgEvent.errorMessage }),
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: imgEvent.taskId,
          prompt: "",
          status: imgEvent.status === "complete" ? "done" : imgEvent.status,
          ...(imgEvent.url && { assetId: extractAssetId(imgEvent.url) }),
          ...(imgEvent.errorMessage && { errorMessage: imgEvent.errorMessage }),
        },
      ];
    });

    const statusMap: Record<string, string> = {
      queued: "排队中",
      generating: "生成中",
      complete: "已完成",
      failed: "失败",
    };

    const progressNum = Number(imgEvent.progress);
    const progressPercent = Number.isFinite(progressNum)
      ? Math.max(0, Math.min(100, Math.round(progressNum * 100)))
      : null;

    const bucket = imgEvent.status === "generating"
      ? `generating:${progressPercent === null ? "na" : Math.floor(progressPercent / 20) * 20}`
      : String(imgEvent.status || "unknown");

    const taskId = Number(imgEvent.taskId || 0);
    const prevBucket = memory.imageProgressBuckets.get(taskId);
    if (prevBucket !== bucket) {
      memory.imageProgressBuckets.set(taskId, bucket);

      const statusText = statusMap[imgEvent.status as string] || String(imgEvent.status || "处理中");
      const progressText = imgEvent.status === "generating" && progressPercent !== null
        ? `（${progressPercent}%）`
        : "";
      const errorText = imgEvent.status === "failed" && imgEvent.errorMessage
        ? `：${imgEvent.errorMessage}`
        : "";

      appendAssistantLine(
        `第 ${taskId || "?"} 张图片${statusText}${progressText}${errorText}`,
        assistantContent,
        collectedEvents,
        callbacks
      );
    }
  }

  // 处理 content_update 事件
  if (event.type === "content_update") {
    const contentEvent = event as any;
    if (contentEvent.title || contentEvent.body || contentEvent.tags) {
      callbacks.setMessages((prev) => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg?.role === "assistant") {
          let formattedContent = "";
          if (contentEvent.title) {
            formattedContent += `标题: ${contentEvent.title}\n\n`;
          }
          if (contentEvent.body) {
            formattedContent += contentEvent.body;
          }
          if (contentEvent.tags && contentEvent.tags.length > 0) {
            formattedContent += `\n\n标签: ${contentEvent.tags.map((t: string) => `#${t}`).join(" ")}`;
          }
          lastMsg.content = formattedContent;
        }
        return newMessages;
      });
    }
  }

  // 处理 workflow_progress 事件
  if (event.type === "workflow_progress") {
    const progressEvent = event as any;
    callbacks.setStreamPhase(progressEvent.phase || "处理中...");
  }

  const structuredLine = formatStructuredEventLine(event);
  if (structuredLine) {
    appendAssistantLine(structuredLine, assistantContent, collectedEvents, callbacks);
  }

  // 处理 workflow_complete 事件（工作流完成，渲染最终结果卡片）
  if (event.type === "workflow_complete") {
    const completeEvent = event as any;

    // 更新最后一条 assistant 消息，添加最终内容和图片
    callbacks.setMessages((prev) => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];

      if (lastMsg?.role === "assistant") {
        // 更新最后一条消息的内容和事件
        lastMsg.content = completeEvent.content || lastMsg.content;
        lastMsg.events = [...(lastMsg.events || []), event];
      } else {
        // 添加新的 assistant 消息
        newMessages.push({
          role: "assistant",
          content: completeEvent.content || "创作完成",
          events: [event],
        });
      }
      return newMessages;
    });

    // 同步更新 imageTasks 状态（确保所有图片显示为完成）
    if (completeEvent.imageAssetIds?.length > 0) {
      callbacks.setImageTasks((prev) => {
        const updated = [...prev];
        completeEvent.imageAssetIds.forEach((assetId: number, index: number) => {
          const taskId = index + 1;
          const existingIndex = updated.findIndex((t) => t.id === taskId);
          if (existingIndex >= 0) {
            updated[existingIndex] = {
              ...updated[existingIndex],
              status: "done",
              assetId,
            };
          } else {
            updated.push({
              id: taskId,
              prompt: "",
              status: "done",
              assetId,
            });
          }
        });
        return updated;
      });
    }

    // 设置进度为 100%
    callbacks.setStreamPhase("创作完成");
  }
}

/**
 * 带超时的 Promise
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 处理 SSE 流
 * @param response - fetch 响应对象
 * @param callbacks - 状态更新回调
 * @param options - 处理选项
 */
export async function processSSEStream(
  response: Response,
  callbacks: StreamProcessorCallbacks,
  options: StreamProcessorOptions = {}
): Promise<void> {
  const {
    resetEvents = false,
    source = "processSSEStream",
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  const assistantContent = { current: "" };
  const collectedEvents: AgentEvent[] = [];
  const eventMemory: ProcessEventMemory = { imageProgressBuckets: new Map<number, string>() };
  let lastActivityTime = Date.now();
  let isAborted = false;
  let sseBuffer = "";

  // 设置超时检测
  const checkTimeout = () => {
    const elapsed = Date.now() - lastActivityTime;
    if (elapsed > timeoutMs && !isAborted) {
      console.warn(`[${source}] 流超时: ${elapsed}ms 无活动`);
      isAborted = true;
      reader.cancel().catch(() => {});
      callbacks.onError?.(new Error(`连接超时 (${Math.round(timeoutMs / 1000)}秒无响应)`));
    }
  };

  const timeoutInterval = setInterval(checkTimeout, 5000);

  try {
    while (true) {
      if (isAborted) break;

      // 带超时的读取
      const readPromise = reader.read();
      const { done, value } = await withTimeout(
        readPromise,
        timeoutMs,
        `读取超时 (${Math.round(timeoutMs / 1000)}秒)`
      );

      if (done) break;

      // 更新活动时间
      lastActivityTime = Date.now();

      sseBuffer += decoder.decode(value, { stream: true });
      const chunks = sseBuffer.split("\n\n");
      sseBuffer = chunks.pop() || "";

      for (const chunk of chunks) {
        const lines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6));

        if (lines.length === 0) continue;

        const data = lines.join("\n");
        if (data === "[DONE]") continue;

        try {
          const event: AgentEvent = JSON.parse(data);
          collectedEvents.push(event);

          // 更新 events 状态
          if (resetEvents) {
            callbacks.setEvents([...collectedEvents]);
          } else {
            callbacks.setEvents((prev) => [...prev, event]);
          }

          // 处理事件
          processStreamEvent(event, collectedEvents, assistantContent, callbacks, { source }, eventMemory);
        } catch (parseError) {
          console.error(`[${source}] Failed to parse SSE event:`, parseError);
        }
      }
    }

    // 处理可能残留的最后一帧
    const finalFrame = sseBuffer.trim();
    if (finalFrame.startsWith("data: ")) {
      const data = finalFrame.slice(6);
      if (data !== "[DONE]") {
        try {
          const event: AgentEvent = JSON.parse(data);
          collectedEvents.push(event);
          if (resetEvents) {
            callbacks.setEvents([...collectedEvents]);
          } else {
            callbacks.setEvents((prev) => [...prev, event]);
          }
          processStreamEvent(event, collectedEvents, assistantContent, callbacks, { source }, eventMemory);
        } catch (parseError) {
          console.error(`[${source}] Failed to parse final SSE event:`, parseError);
        }
      }
    }

    if (!isAborted) {
      callbacks.onComplete?.();
    }
  } catch (error) {
    console.error(`[${source}] Stream error:`, error);
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    clearInterval(timeoutInterval);
  }
}

/**
 * 带重试的流处理
 * @param fetchFn - 返回 fetch Response 的函数
 * @param callbacks - 状态更新回调
 * @param options - 处理选项
 */
export async function processSSEStreamWithRetry(
  fetchFn: () => Promise<Response>,
  callbacks: StreamProcessorCallbacks,
  options: StreamProcessorOptions = {}
): Promise<void> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    source = "processSSEStreamWithRetry",
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[${source}] 重试第 ${attempt} 次...`);
        await delay(retryDelayMs * attempt); // 指数退避
      }

      const response = await fetchFn();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await processSSEStream(response, callbacks, { ...options, source });
      return; // 成功，退出
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[${source}] 第 ${attempt + 1} 次尝试失败:`, lastError.message);

      // 如果是 workflow_paused 导致的流结束，不算错误
      if (lastError.message.includes("workflow_paused")) {
        return;
      }

      // 最后一次尝试失败
      if (attempt === maxRetries) {
        callbacks.onError?.(new Error(`重试 ${maxRetries} 次后仍然失败: ${lastError.message}`));
        throw lastError;
      }
    }
  }
}

/**
 * 创建统一的流处理回调对象
 */
export function createStreamCallbacks(
  setters: {
    setEvents: React.Dispatch<React.SetStateAction<AgentEvent[]>>;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setImageTasks: React.Dispatch<React.SetStateAction<ImageTask[]>>;
    setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
    setStreamPhase: React.Dispatch<React.SetStateAction<string>>;
    setAskUserDialog: React.Dispatch<React.SetStateAction<AskUserDialogState>>;
  },
  options?: {
    updatePhase?: (event: AgentEvent) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
    onConversationId?: (id: number) => void;
  }
): StreamProcessorCallbacks {
  return {
    ...setters,
    ...options,
  };
}
