import type { Theme } from '@/App';
import { AgentCreator } from '@/features/agent/components/AgentCreator';

interface GenerationSectionProps {
  theme: Theme;
}

export function GenerationSection({ theme }: GenerationSectionProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <AgentCreator theme={theme} />
      </div>
    </div>
  );
}
