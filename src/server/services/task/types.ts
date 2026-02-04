import type { AgentEvent } from '@/server/agents/state/agentState';

export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed';

export type HitlStatus = 'none' | 'pending' | 'responded';

export type TaskEventPayload = AgentEvent | {
  type: 'workflow_complete' | 'workflow_failed';
  content?: string;
  timestamp: number;
  [key: string]: any;
};

export type TaskEventEnvelope = TaskEventPayload & {
  eventIndex: number;
};

export interface TaskSubmitPayload {
  message: string;
  themeId: number;
  enableHITL?: boolean;
  referenceImages?: string[];
  imageGenProvider?: string;
  sourceTaskId?: number;
}

export interface TaskStatusResponse {
  id: number;
  status: TaskStatus;
  progress: number;
  currentAgent?: string | null;
  hitlStatus?: HitlStatus | null;
  hitlData?: Record<string, unknown> | null;
  creativeId?: number | null;
  errorMessage?: string | null;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
  threadId?: string | null;
}

export interface TaskHitlResponse {
  action: 'approve' | 'reject';
  selectedIds?: string[];
  customInput?: string;
  modifiedData?: any;
}
