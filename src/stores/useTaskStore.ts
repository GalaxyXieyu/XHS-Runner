import { create } from 'zustand';
import type { AutoTask } from '@/features/task-management/types';

interface TaskStore {
  // 状态
  scheduledTasks: AutoTask[];
  editingTask: AutoTask | null;
  showTaskForm: boolean;
  loading: boolean;

  // Actions
  setScheduledTasks: (tasks: AutoTask[]) => void;
  setEditingTask: (task: AutoTask | null) => void;
  setShowTaskForm: (show: boolean) => void;

  loadTasks: (themeId: number) => Promise<void>;
  createTask: (themeId: number, payload: any) => Promise<void>;
  updateTask: (id: string, payload: any) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  triggerTask: (id: string) => Promise<void>;
  toggleTaskStatus: (id: string) => Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  // 初始状态
  scheduledTasks: [],
  editingTask: null,
  showTaskForm: false,
  loading: false,

  // Simple setters
  setScheduledTasks: (tasks) => set({ scheduledTasks: tasks }),
  setEditingTask: (task) => set({ editingTask: task }),
  setShowTaskForm: (show) => set({ showTaskForm: show }),

  // 加载任务列表
  loadTasks: async (themeId: number) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/jobs?themeId=${themeId}`);
      const data = await res.json();

      // 转换任务格式
      const tasks: AutoTask[] = Array.isArray(data) ? data.map((job: any) => ({
        id: String(job.id),
        name: job.name || job.description || '未命名任务',
        schedule: job.schedule || '手动执行',
        config: {
          goal: (job.config?.goal as 'collects' | 'comments' | 'followers') || 'collects',
          persona: job.config?.persona || '25-35岁职场女性',
          tone: job.config?.tone || '干货/亲和',
          promptProfileId: job.config?.prompt_profile_id || '1',
          imageModel: (job.config?.image_model as 'nanobanana' | 'jimeng') || 'nanobanana',
          outputCount: job.config?.output_count || 5,
          minQualityScore: job.config?.min_quality_score || 70,
        },
        status: job.is_enabled ? 'active' : 'paused',
        lastRunAt: job.last_run_at,
        nextRunAt: job.next_run_at || new Date().toISOString(),
        totalRuns: job.total_runs || 0,
        successfulRuns: job.successful_runs || 0,
      })) : [];

      set({ scheduledTasks: tasks });
    } catch (error) {
      console.error('Failed to load tasks:', error);
      set({ scheduledTasks: [] });
    } finally {
      set({ loading: false });
    }
  },

  // 创建任务
  createTask: async (themeId: number, payload: any) => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, theme_id: themeId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || '创建任务失败');
    }

    // 重新加载任务列表
    await get().loadTasks(themeId);
  },

  // 更新任务
  updateTask: async (id: string, payload: any) => {
    const res = await fetch(`/api/jobs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || '更新任务失败');
    }
  },

  // 删除任务
  deleteTask: async (id: string) => {
    const res = await fetch(`/api/jobs/${id}`, {
      method: 'DELETE'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || '删除任务失败');
    }

    // 从状态中移除
    set((state) => ({
      scheduledTasks: state.scheduledTasks.filter((t) => t.id !== id),
    }));
  },

  // 触发任务执行
  triggerTask: async (id: string) => {
    const res = await fetch(`/api/jobs/${id}/trigger`, {
      method: 'POST'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || '触发执行失败');
    }
  },

  // 切换任务状态
  toggleTaskStatus: async (id: string) => {
    const task = get().scheduledTasks.find((t) => t.id === id);
    if (!task) return;

    const newStatus = task.status === 'active' ? 'paused' : 'active';

    const res = await fetch(`/api/jobs/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || '切换任务状态失败');
    }

    // 更新本地状态
    set((state) => ({
      scheduledTasks: state.scheduledTasks.map((t) =>
        t.id === id ? { ...t, status: newStatus } : t
      ),
    }));
  },
}));
