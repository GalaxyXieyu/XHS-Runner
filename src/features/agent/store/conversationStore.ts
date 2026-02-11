import { create } from 'zustand';

interface Conversation {
  id: number;
  threadId: string;
  title: string | null;
  status: string;
  creativeId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationState {
  conversationId: number | null;
  conversations: Conversation[];
  isLoading: boolean;
  isOpen: boolean;

  setConversationId: (id: number | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  setIsLoading: (loading: boolean) => void;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversationId: null,
  conversations: [],
  isLoading: false,
  isOpen: false,

  setConversationId: (id) => set({ conversationId: id }),
  setConversations: (conversations) => set({ conversations }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
}));

export type { Conversation };
