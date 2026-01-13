import { useCompletion, UseCompletionOptions } from '@ai-sdk/react';

export interface UseLLMStreamOptions {
  api: string;
  body?: Record<string, unknown>;
  providerId?: number | null;
  onFinish?: (completion: string) => void;
}

/**
 * 统一的 LLM 流式调用 hook
 * 封装 useCompletion，自动设置 streamProtocol: 'text'
 */
export function useLLMStream(options: UseLLMStreamOptions) {
  const { api, body = {}, providerId, onFinish } = options;

  const completionOptions: UseCompletionOptions = {
    api,
    streamProtocol: 'text',
    body: {
      ...body,
      providerId,
    },
    onFinish: onFinish ? (_, completion) => onFinish(completion as string) : undefined,
  };

  const {
    completion,
    isLoading,
    complete,
    error,
    stop,
    setCompletion,
  } = useCompletion(completionOptions);

  return {
    /** 当前流式输出的文本 */
    text: completion,
    /** 是否正在加载 */
    loading: isLoading,
    /** 触发流式生成 */
    generate: complete,
    /** 错误信息 */
    error,
    /** 停止生成 */
    stop,
    /** 手动设置文本 */
    setText: setCompletion,
  };
}
