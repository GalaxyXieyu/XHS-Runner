export interface AutoTask {
  id: string;
  name: string;
  schedule: string;
  config: {
    goal: 'collects' | 'comments' | 'followers';
    persona: string;
    tone: string;
    promptProfileId: string;
    imageModel: 'nanobanana' | 'jimeng';
    outputCount: number;
    minQualityScore: number;
  };
  status: 'active' | 'paused';
  lastRunAt?: string;
  nextRunAt: string;
  totalRuns: number;
  successfulRuns: number;
}

export interface TaskExecution {
  id: string;
  taskId?: string;
  taskName: string;
  taskType: 'instant' | 'scheduled';
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  progress: number;
  generatedCount: number;
  targetCount: number;
  errorMessage?: string;
}
