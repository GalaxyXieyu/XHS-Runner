import { useState, useCallback } from 'react';
import { createInitialUIState, reduceStreamingState, type StreamingUIState, type EnhancedAgentEvent } from '@/lib/streaming';

export interface UseAgentStreamingOptions {
  onUpdate?: (state: StreamingUIState) => void;
  onComplete?: (state: StreamingUIState) => void;
  onError?: (error: string) => void;
}

export function useAgentStreaming(options: UseAgentStreamingOptions = {}) {
  const [state, setState] = useState<StreamingUIState>(createInitialUIState());
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStreaming = useCallback(async (
    message: string,
    themeId?: number,
    streamOptions?: {
      referenceImages?: string[];
      imageGenProvider?: string;
      enableHITL?: boolean;
    }
  ) => {
    setIsStreaming(true);
    setError(null);
    setState(createInitialUIState());

    try {
      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          themeId,
          referenceImages: streamOptions?.referenceImages,
          imageGenProvider: streamOptions?.imageGenProvider,
          enableHITL: streamOptions?.enableHITL,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              setIsStreaming(false);
              setState(prev => {
                const finalState = { ...prev, workflow: { ...prev.workflow, isComplete: true } };
                options.onComplete?.(finalState);
                return finalState;
              });
              return;
            }

            if (data) {
              try {
                const event = JSON.parse(data) as EnhancedAgentEvent;
                setState(prev => {
                  const newState = reduceStreamingState(prev, event);
                  options.onUpdate?.(newState);
                  return newState;
                });
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError, 'Data:', data);
              }
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsStreaming(false);
      options.onError?.(errorMessage);
    }
  }, [options]);

  return {
    state,
    isStreaming,
    error,
    startStreaming,
  };
}
