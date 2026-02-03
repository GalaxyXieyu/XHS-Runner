/**
 * 图片生成进度事件发射器
 * 
 * 用于在 imageAgentNode 执行过程中实时推送进度到前端
 * 解决 LangGraph 节点只能在完成后返回状态的问题
 */

export interface ImageProgressEvent {
  taskId: number;
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress: number;
  url?: string;
  assetId?: number;
  errorMessage?: string;
}

type ProgressCallback = (event: ImageProgressEvent) => void;

// 使用 Map 存储每个 threadId 对应的回调
const progressCallbacks = new Map<string, ProgressCallback>();

/**
 * 注册进度回调
 * @param threadId 线程 ID（用于区分不同的请求）
 * @param callback 进度回调函数
 */
export function registerProgressCallback(threadId: string, callback: ProgressCallback): void {
  progressCallbacks.set(threadId, callback);
}

/**
 * 移除进度回调
 * @param threadId 线程 ID
 */
export function unregisterProgressCallback(threadId: string): void {
  progressCallbacks.delete(threadId);
}

/**
 * 发送图片进度事件
 * @param threadId 线程 ID
 * @param event 进度事件
 */
export function emitImageProgress(threadId: string, event: ImageProgressEvent): void {
  const callback = progressCallbacks.get(threadId);
  if (callback) {
    callback(event);
  } else {
    // 如果没有注册回调，尝试使用全局回调（兼容非 HITL 模式）
    const globalCallback = progressCallbacks.get('global');
    if (globalCallback) {
      globalCallback(event);
    }
  }
}

/**
 * 清理所有回调（用于测试或重置）
 */
export function clearAllProgressCallbacks(): void {
  progressCallbacks.clear();
}
