import { create } from 'zustand';
import type { AgentEvent, AskUserDialogState, ChatMessage, ImageTask } from '../types';
import { createInitialAskUserState } from '../components/AskUserDialog';

type SetStateAction<T> = T | ((prev: T) => T);

type StateSetter<T> = (action: SetStateAction<T>) => void;

type ToggleMap = Record<string, boolean>;

function resolveAction<T>(prev: T, action: SetStateAction<T>): T {
  if (typeof action === 'function') {
    return (action as (prev: T) => T)(prev);
  }
  return action;
}

interface AgentStreamState {
  messages: ChatMessage[];
  events: AgentEvent[];
  imageTasks: ImageTask[];
  isStreaming: boolean;
  streamPhase: string;
  streamStartedAt: number | null;
  workflowProgress: number;
  askUserDialog: AskUserDialogState;
  expandedStageIds: ToggleMap;
  expandedGroupIds: ToggleMap;
  expandedItemIds: ToggleMap;
  /** null = 自动（流式中展开、历史折叠），boolean = 用户手动覆盖 */
  traceExpanded: boolean | null;

  setMessages: StateSetter<ChatMessage[]>;
  setEvents: StateSetter<AgentEvent[]>;
  setImageTasks: StateSetter<ImageTask[]>;
  setIsStreaming: StateSetter<boolean>;
  setStreamPhase: StateSetter<string>;
  setStreamStartedAt: StateSetter<number | null>;
  setWorkflowProgress: StateSetter<number>;
  setAskUserDialog: StateSetter<AskUserDialogState>;

  setTraceExpanded: (next: boolean) => void;
  toggleStage: (id: string) => void;
  toggleGroup: (id: string) => void;
  toggleItem: (id: string) => void;

  resetStream: () => void;
}

export const useAgentStreamStore = create<AgentStreamState>((set) => ({
  messages: [],
  events: [],
  imageTasks: [],
  isStreaming: false,
  streamPhase: '',
  streamStartedAt: null,
  workflowProgress: 0,
  askUserDialog: createInitialAskUserState(),
  expandedStageIds: {},
  expandedGroupIds: {},
  expandedItemIds: {},
  traceExpanded: null,

  setMessages: (action) => set((state) => ({ messages: resolveAction(state.messages, action) })),
  setEvents: (action) => set((state) => ({ events: resolveAction(state.events, action) })),
  setImageTasks: (action) => set((state) => ({ imageTasks: resolveAction(state.imageTasks, action) })),
  setIsStreaming: (action) => set((state) => ({ isStreaming: resolveAction(state.isStreaming, action) })),
  setStreamPhase: (action) => set((state) => ({ streamPhase: resolveAction(state.streamPhase, action) })),
  setStreamStartedAt: (action) => set((state) => ({ streamStartedAt: resolveAction(state.streamStartedAt, action) })),
  setWorkflowProgress: (action) => set((state) => ({ workflowProgress: resolveAction(state.workflowProgress, action) })),
  setAskUserDialog: (action) => set((state) => ({ askUserDialog: resolveAction(state.askUserDialog, action) })),

  setTraceExpanded: (next) => set({ traceExpanded: next }),
  toggleStage: (id) =>
    set((state) => ({
      expandedStageIds: {
        ...state.expandedStageIds,
        [id]: !state.expandedStageIds[id],
      },
    })),
  toggleGroup: (id) =>
    set((state) => ({
      expandedGroupIds: {
        ...state.expandedGroupIds,
        [id]: !state.expandedGroupIds[id],
      },
    })),
  toggleItem: (id) =>
    set((state) => ({
      expandedItemIds: {
        ...state.expandedItemIds,
        [id]: !state.expandedItemIds[id],
      },
    })),

  resetStream: () =>
    set({
      messages: [],
      events: [],
      imageTasks: [],
      isStreaming: false,
      streamPhase: '',
      streamStartedAt: null,
      workflowProgress: 0,
      askUserDialog: createInitialAskUserState(),
      expandedStageIds: {},
      expandedGroupIds: {},
      expandedItemIds: {},
      traceExpanded: null,
    }),
}));

export type { SetStateAction, StateSetter };
