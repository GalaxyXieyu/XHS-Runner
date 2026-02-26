/**
 * Image prompt evidence event emitter.
 *
 * This is intentionally separate from progressEmitter to keep the payload
 * small and to avoid coupling prompt evidence to progress UI concerns.
 */

export interface ImagePromptReadyEvent {
  taskId: number;
  sequence: number;
  role: string;
  provider: 'ark' | 'jimeng' | 'gemini';
  imageModel?: string;
  finalPrompt: string;
  finalPromptHash: string;
  finalPromptPreview: string;
  referenceImageCount: number;
}

type PromptCallback = (event: ImagePromptReadyEvent) => void;

const promptCallbacks = new Map<string, PromptCallback>();

export function registerPromptCallback(threadId: string, callback: PromptCallback): void {
  promptCallbacks.set(threadId, callback);
}

export function unregisterPromptCallback(threadId: string): void {
  promptCallbacks.delete(threadId);
}

export function emitImagePromptReady(threadId: string, event: ImagePromptReadyEvent): void {
  const callback = promptCallbacks.get(threadId) || promptCallbacks.get('global');
  if (callback) callback(event);
}

export function clearAllPromptCallbacks(): void {
  promptCallbacks.clear();
}
