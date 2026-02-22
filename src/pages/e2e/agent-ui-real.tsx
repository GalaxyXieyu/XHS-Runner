import { useEffect, useMemo, useState } from 'react';
import { AgentCreator } from '@/features/agent/components/AgentCreator';
import { useAgentStreamStore } from '@/features/agent/store/agentStreamStore';

// Real-login E2E harness:
// - Requires app auth session cookie.
// - Seeds a conversation with ask_user via /api/dev/seed-ask-user (writes to DB).
// - Loads conversation messages from DB via /api/conversations/:id.
// - AgentCreator opens an interactive ask_user UI from the loaded history.

export default function E2EAgentUIRealPage() {
  const [status, setStatus] = useState<'init' | 'ready' | 'error'>('init');
  const [error, setError] = useState<string>('');
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

  const [threadId, setThreadId] = useState<string | null>(null);

  const seedAndLoad = async () => {
    setStatus('init');
    setError('');

    // Ensure we're logged in.
    const me = await fetch('/api/app-auth/me').then((r) => r.json());
    if (!me?.user) {
      setStatus('error');
      setError('Not logged in. Please login first.');
      return;
    }

    const seed = await fetch('/api/dev/seed-ask-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: threadId || undefined,
        question: 'E2E ask_user (real): pick one',
        options: [
          { id: 'first', label: 'First' },
          { id: 'second', label: 'Second' },
        ],
      }),
    }).then((r) => r.json());

    if (!seed?.conversationId) {
      setStatus('error');
      setError(seed?.error || 'Failed to seed ask_user');
      return;
    }

    if (typeof seed.threadId === 'string' && !threadId) {
      setThreadId(seed.threadId);
    }

    const conv = await fetch(`/api/conversations/${seed.conversationId}`).then((r) => r.json());
    if (!Array.isArray(conv?.messages)) {
      setStatus('error');
      setError('Failed to load conversation');
      return;
    }

    const loadedMessages = conv.messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      agent: msg.agent,
      events: msg.events,
      askUser: msg.askUser,
      askUserResponse: msg.askUserResponse,
    }));

    const store = useAgentStreamStore.getState();
    store.resetStream();
    store.setMessages(loadedMessages);

    setStatus('ready');
  };

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    void seedAndLoad();
  }, []);

  if (process.env.NODE_ENV === 'production') return <div>Not found</div>;

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
        <button
          data-testid="reseed"
          className="px-3 py-2 text-sm rounded bg-white border border-gray-200"
          onClick={() => void seedAndLoad()}
        >
          Reseed ask_user
        </button>
        <div className="text-xs text-gray-600" data-testid="status">
          /e2e/agent-ui-real status: {status}{error ? ` (${error})` : ''}
        </div>
      </div>

      <div className="h-[calc(100vh-64px)]">
        <AgentCreator theme={theme as any} />
      </div>
    </div>
  );
}
