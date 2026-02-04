import { create } from 'zustand';

export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed';

export interface BackgroundTask {
  id: number;
  status: TaskStatus;
  progress: number;
  currentAgent: string | null;
  hitlStatus: string | null;
  hitlData: any | null;
  creativeId: number | null;
  errorMessage: string | null;
  eventCount: number;
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  eventIndex: number;
  type: string;
  agent?: string;
  content?: string;
  timestamp: number;
  [key: string]: any;
}

interface BackgroundTaskStore {
  // 活跃任务映射 (taskId -> task)
  tasks: Map<number, BackgroundTask>;
  // 每个任务的事件列表
  events: Map<number, TaskEvent[]>;
  // SSE 订阅
  subscriptions: Map<number, EventSource>;

  // Actions
  submitTask: (params: {
    message: string;
    themeId: number;
    enableHITL?: boolean;
    referenceImages?: string[];
    imageGenProvider?: string;
    sourceTaskId?: number;
  }) => Promise<number>;

  fetchTaskStatus: (taskId: number) => Promise<BackgroundTask | null>;
  subscribeToTask: (taskId: number, onEvent?: (event: TaskEvent) => void) => void;
  unsubscribeFromTask: (taskId: number) => void;
  respondToTask: (taskId: number, response: {
    action: 'approve' | 'reject';
    selectedIds?: string[];
    customInput?: string;
    modifiedData?: any;
  }) => Promise<void>;

  // Internal
  setTask: (task: BackgroundTask) => void;
  appendEvent: (taskId: number, event: TaskEvent) => void;
  removeTask: (taskId: number) => void;
}

export const useBackgroundTaskStore = create<BackgroundTaskStore>((set, get) => ({
  tasks: new Map(),
  events: new Map(),
  subscriptions: new Map(),

  submitTask: async (params) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || '提交任务失败');
    }

    const taskId = data.taskId as number;

    // 初始化任务状态
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(taskId, {
        id: taskId,
        status: 'queued',
        progress: 0,
        currentAgent: null,
        hitlStatus: data.threadId ? 'none' : null,
        hitlData: null,
        creativeId: null,
        errorMessage: null,
        eventCount: 0,
        threadId: data.threadId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return { tasks };
    });

    return taskId;
  },

  fetchTaskStatus: async (taskId) => {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error('获取任务状态失败');
    }

    const task = await res.json();
    get().setTask(task);
    return task;
  },

  subscribeToTask: (taskId, onEvent) => {
    const existing = get().subscriptions.get(taskId);
    if (existing) return; // 已订阅

    const eventSource = new EventSource(`/api/tasks/${taskId}/events`);

    eventSource.onmessage = (e) => {
      if (e.data === '[DONE]') {
        get().unsubscribeFromTask(taskId);
        return;
      }

      try {
        const event: TaskEvent = JSON.parse(e.data);
        get().appendEvent(taskId, event);

        // 更新任务状态
        if (event.type === 'agent_start' && event.agent) {
          set((state) => {
            const tasks = new Map(state.tasks);
            const task = tasks.get(taskId);
            if (task) {
              tasks.set(taskId, { ...task, currentAgent: event.agent!, status: 'running' });
            }
            return { tasks };
          });
        }

        if (event.type === 'workflow_complete') {
          set((state) => {
            const tasks = new Map(state.tasks);
            const task = tasks.get(taskId);
            if (task) {
              tasks.set(taskId, {
                ...task,
                status: 'completed',
                progress: 100,
                creativeId: (event as any).creativeId || task.creativeId,
              });
            }
            return { tasks };
          });
        }

        if (event.type === 'workflow_failed') {
          set((state) => {
            const tasks = new Map(state.tasks);
            const task = tasks.get(taskId);
            if (task) {
              tasks.set(taskId, {
                ...task,
                status: 'failed',
                errorMessage: event.content || 'Unknown error',
              });
            }
            return { tasks };
          });
        }

        if (event.type === 'ask_user') {
          set((state) => {
            const tasks = new Map(state.tasks);
            const task = tasks.get(taskId);
            if (task) {
              tasks.set(taskId, {
                ...task,
                status: 'paused',
                hitlStatus: 'pending',
                hitlData: {
                  question: (event as any).question,
                  options: (event as any).options,
                  selectionType: (event as any).selectionType,
                  allowCustomInput: (event as any).allowCustomInput,
                  context: (event as any).context,
                },
              });
            }
            return { tasks };
          });
        }

        onEvent?.(event);
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      get().unsubscribeFromTask(taskId);
    };

    set((state) => {
      const subscriptions = new Map(state.subscriptions);
      subscriptions.set(taskId, eventSource);
      return { subscriptions };
    });
  },

  unsubscribeFromTask: (taskId) => {
    const eventSource = get().subscriptions.get(taskId);
    if (eventSource) {
      eventSource.close();
      set((state) => {
        const subscriptions = new Map(state.subscriptions);
        subscriptions.delete(taskId);
        return { subscriptions };
      });
    }
  },

  respondToTask: async (taskId, response) => {
    const res = await fetch(`/api/tasks/${taskId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'HITL 响应失败');
    }

    // 更新任务状态
    set((state) => {
      const tasks = new Map(state.tasks);
      const task = tasks.get(taskId);
      if (task) {
        tasks.set(taskId, {
          ...task,
          status: 'running',
          hitlStatus: 'responded',
        });
      }
      return { tasks };
    });
  },

  setTask: (task) => {
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.id, task);
      return { tasks };
    });
  },

  appendEvent: (taskId, event) => {
    set((state) => {
      const events = new Map(state.events);
      const taskEvents = events.get(taskId) || [];
      events.set(taskId, [...taskEvents, event]);
      return { events };
    });
  },

  removeTask: (taskId) => {
    get().unsubscribeFromTask(taskId);
    set((state) => {
      const tasks = new Map(state.tasks);
      const events = new Map(state.events);
      tasks.delete(taskId);
      events.delete(taskId);
      return { tasks, events };
    });
  },
}));
