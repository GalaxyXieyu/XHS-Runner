import { create } from 'zustand';

type IdeaConfig = {
  idea: string;
  styleKeyOption: 'cozy' | 'minimal' | 'illustration' | 'ink' | 'anime' | '3d' | 'cyberpunk' | 'photo' | 'custom';
  customStyleKey: string;
  aspectRatio: '3:4' | '1:1' | '4:3';
  count: number;
  model: 'nanobanana' | 'jimeng';
  goal: 'collects' | 'comments' | 'followers';
  persona: string;
  tone: string;
  extraRequirements: string;
};

interface GenerationStore {
  // One-Click 生成状态
  ideaConfig: IdeaConfig;
  ideaPreviewPrompts: string[];
  ideaPreviewLoading: boolean;
  ideaPreviewError: string;
  showIdeaConfirmModal: boolean;
  ideaConfirming: boolean;
  ideaConfirmError: string;
  ideaCreativeId: number | null;
  ideaTaskIds: number[];

  // Actions
  setIdeaConfig: (config: Partial<IdeaConfig>) => void;
  setIdeaCreativeId: (id: number | null) => void;
  setIdeaTaskIds: (ids: number[]) => void;
  setShowIdeaConfirmModal: (show: boolean) => void;
  setIdeaConfirmError: (error: string) => void;

  handleIdeaPreview: (themeId: number) => Promise<void>;
  handleIdeaConfirm: () => Promise<void>;
  updatePrompt: (index: number, value: string) => void;
  addPrompt: () => void;
  removePrompt: (index: number) => void;
  movePrompt: (index: number, direction: -1 | 1) => void;
  sanitizePromptsForConfirm: () => string[];
  resolveStyleKey: () => string;
  reset: () => void;
}

const initialIdeaConfig: IdeaConfig = {
  idea: '',
  styleKeyOption: 'cozy',
  customStyleKey: '',
  aspectRatio: '3:4',
  count: 4,
  model: 'nanobanana',
  goal: 'collects',
  persona: '25-35岁职场女性，追求实用与高效',
  tone: '干货/亲和',
  extraRequirements: '',
};

const normalizePrompts = (prompts: unknown): string[] => {
  if (!Array.isArray(prompts)) return [];
  return prompts
    .filter((p) => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean);
};

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  // 初始状态
  ideaConfig: { ...initialIdeaConfig },
  ideaPreviewPrompts: [],
  ideaPreviewLoading: false,
  ideaPreviewError: '',
  showIdeaConfirmModal: false,
  ideaConfirming: false,
  ideaConfirmError: '',
  ideaCreativeId: null,
  ideaTaskIds: [],

  // Actions
  setIdeaConfig: (config) => set((state) => ({ ideaConfig: { ...state.ideaConfig, ...config } })),
  setIdeaCreativeId: (id) => set({ ideaCreativeId: id }),
  setIdeaTaskIds: (ids) => set({ ideaTaskIds: ids }),
  setShowIdeaConfirmModal: (show) => set({ showIdeaConfirmModal: show }),
  setIdeaConfirmError: (error) => set({ ideaConfirmError: error }),

  handleIdeaPreview: async (themeId: number) => {
    const { ideaConfig } = get();
    if (!ideaConfig.idea.trim()) return;

    set({ ideaPreviewLoading: true, ideaPreviewError: '' });

    const styleKey = get().resolveStyleKey() || 'cozy';
    try {
      const res = await fetch('/api/generate/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: ideaConfig.idea,
          styleKey,
          aspectRatio: ideaConfig.aspectRatio,
          count: ideaConfig.count,
          goal: ideaConfig.goal,
          persona: ideaConfig.persona,
          tone: ideaConfig.tone,
          extraRequirements: ideaConfig.extraRequirements,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const prompts = normalizePrompts(data?.prompts);
      if (prompts.length === 0) {
        throw new Error('LLM 未返回有效 prompts（可手动编辑后继续）');
      }

      set({ ideaPreviewPrompts: prompts });
    } catch (error) {
      const message = error instanceof Error ? error.message : '预览失败';
      console.error('Idea preview failed:', message);
      set((state) => ({
        ideaPreviewError: message,
        ideaPreviewPrompts: state.ideaPreviewPrompts.length > 0 ? state.ideaPreviewPrompts : [''],
      }));
    } finally {
      set({ ideaPreviewLoading: false });
    }
  },

  handleIdeaConfirm: async () => {
    const { ideaConfirming, ideaConfig, sanitizePromptsForConfirm } = get();
    if (ideaConfirming) return;

    const prompts = sanitizePromptsForConfirm();
    if (prompts.length === 0) {
      set({ ideaConfirmError: 'prompts 不能为空（可先预览或手动新增一条）' });
      return;
    }

    set({ ideaConfirmError: '', ideaConfirming: true });

    try {
      const res = await fetch('/api/generate/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts,
          model: ideaConfig.model,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const creativeId = Number(data?.creativeId);
      const taskIds = Array.isArray(data?.taskIds) ? data.taskIds.map((id: any) => Number(id)) : [];

      if (!Number.isFinite(creativeId) || creativeId <= 0) {
        throw new Error('服务端未返回有效的 creativeId');
      }

      set({
        ideaCreativeId: creativeId,
        ideaTaskIds: taskIds,
        showIdeaConfirmModal: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认失败';
      set({ ideaConfirmError: message });
    } finally {
      set({ ideaConfirming: false });
    }
  },

  updatePrompt: (index, value) =>
    set((state) => ({
      ideaPreviewPrompts: state.ideaPreviewPrompts.map((p, i) => (i === index ? value : p)),
    })),

  addPrompt: () =>
    set((state) => ({
      ideaPreviewPrompts: [...state.ideaPreviewPrompts, ''],
    })),

  removePrompt: (index) =>
    set((state) => ({
      ideaPreviewPrompts: state.ideaPreviewPrompts.filter((_, i) => i !== index),
    })),

  movePrompt: (index, direction) =>
    set((state) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= state.ideaPreviewPrompts.length) return state;
      const copy = [...state.ideaPreviewPrompts];
      const tmp = copy[index];
      copy[index] = copy[nextIndex];
      copy[nextIndex] = tmp;
      return { ideaPreviewPrompts: copy };
    }),

  sanitizePromptsForConfirm: () => {
    const { ideaPreviewPrompts } = get();
    return ideaPreviewPrompts
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .slice(0, 9);
  },

  resolveStyleKey: () => {
    const { ideaConfig } = get();
    if (ideaConfig.styleKeyOption === 'custom') {
      return ideaConfig.customStyleKey.trim();
    }
    return ideaConfig.styleKeyOption;
  },

  reset: () => set({
    ideaConfig: { ...initialIdeaConfig },
    ideaPreviewPrompts: [],
    ideaPreviewLoading: false,
    ideaPreviewError: '',
    showIdeaConfirmModal: false,
    ideaConfirming: false,
    ideaConfirmError: '',
    ideaCreativeId: null,
    ideaTaskIds: [],
  }),
}));
