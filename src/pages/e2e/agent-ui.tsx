import { useEffect, useMemo, useState } from 'react';
import { AgentCreator } from '@/features/agent/components/AgentCreator';
import { useAgentStreamStore } from '@/features/agent/store/agentStreamStore';

// Minimal E2E harness page for UI regression tests.
// - Only enabled outside production.
// - Exposes agent store on window when NEXT_PUBLIC_E2E=1.

export default function E2EAgentUIPage() {
  const [behindClicks, setBehindClicks] = useState(0);

  const theme = useMemo(
    () => ({
      id: '1',
      name: 'E2E Theme',
      description: 'E2E Theme',
      keywords: [],
      competitors: [],
      config: null,
      createdAt: '2026-02-18',
      status: 'active' as const,
    }),
    []
  );

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (process.env.NEXT_PUBLIC_E2E !== '1') return;

    // Expose Zustand store for Playwright to drive ask_user without hitting backend.
    (window as any).__agentStore = useAgentStreamStore;
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return <div>Not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 flex items-center gap-3">
        <button
          data-testid="behind"
          className="px-3 py-2 text-sm rounded bg-gray-900 text-white"
          onClick={() => setBehindClicks((c) => c + 1)}
        >
          Behind Button
        </button>
        <div data-testid="behind-count" className="text-sm text-gray-700">
          clicks:{behindClicks}
        </div>
        <div className="text-xs text-gray-500">/e2e/agent-ui (NEXT_PUBLIC_E2E=1)</div>
      </div>

      <div className="h-[calc(100vh-64px)]">
        <AgentCreator theme={theme as any} />
      </div>
    </div>
  );
}
