import { useEffect } from 'react';
import { useLLMStore } from '../store/llmStore';

export function useLLMProviders(category?: string) {
  const {
    providers, profiles, selectedProviderId, selectedPromptId, loaded,
    setProviders, setProfiles, setSelectedProviderId, setSelectedPromptId, setLoaded,
  } = useLLMStore();

  useEffect(() => {
    if (loaded) return;

    (async () => {
      try {
        const [providersRes, profilesRes] = await Promise.all([
          fetch('/api/llm-providers'),
          fetch('/api/prompt-profiles'),
        ]);

        const [providersData, profilesData] = await Promise.all([
          providersRes.json(),
          profilesRes.json(),
        ]);

        setProviders(providersData);
        setProfiles(profilesData);

        const defaultProvider = (providersData || []).find((p: any) => p?.is_default === 1 || p?.is_default === true);
        if (defaultProvider) setSelectedProviderId(defaultProvider.id);

        setLoaded(true);
      } catch (err) {
        console.error('Failed to load LLM providers/profiles:', err);
      }
    })();
  }, [loaded, setProviders, setProfiles, setSelectedProviderId, setLoaded]);

  const filteredProfiles = category
    ? profiles.filter((p) => p.category === category || p.category === 'analysis')
    : profiles;

  return {
    providers,
    profiles: filteredProfiles,
    selectedProviderId,
    selectedPromptId,
    setSelectedProviderId,
    setSelectedPromptId,
  };
}
