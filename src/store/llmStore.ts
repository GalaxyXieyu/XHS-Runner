import { create } from 'zustand';

export interface LLMProvider {
  id: number;
  name: string;
  model_name?: string | null;
  is_default: number;
  is_enabled: number;
}

export interface PromptProfile {
  id: number;
  name: string;
  category: string;
  system_prompt: string;
  user_template: string;
}

interface LLMState {
  providers: LLMProvider[];
  profiles: PromptProfile[];
  selectedProviderId: number | null;
  selectedPromptId: number | null;
  loaded: boolean;

  setProviders: (providers: LLMProvider[]) => void;
  setProfiles: (profiles: PromptProfile[]) => void;
  setSelectedProviderId: (id: number | null) => void;
  setSelectedPromptId: (id: number | null) => void;
  setLoaded: (loaded: boolean) => void;
}

export const useLLMStore = create<LLMState>((set) => ({
  providers: [],
  profiles: [],
  selectedProviderId: null,
  selectedPromptId: null,
  loaded: false,

  setProviders: (providers) => set({ providers }),
  setProfiles: (profiles) => set({ profiles }),
  setSelectedProviderId: (selectedProviderId) => set({ selectedProviderId }),
  setSelectedPromptId: (selectedPromptId) => set({ selectedPromptId }),
  setLoaded: (loaded) => set({ loaded }),
}));
