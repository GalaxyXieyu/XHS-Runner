export interface AutoTask {
  id: string;
  themeId?: number;
  name: string;
  schedule: string;
  config: {
    goal: 'collects' | 'comments' | 'followers';
    persona: string;
    tone: string;
    promptProfileId: string;
    imageModel: 'nanobanana' | 'jimeng' | 'jimeng-45';
    outputCount: number;
    minQualityScore: number;
  };
  status: 'active' | 'paused';
  lastRunAt?: string;
  nextRunAt: string;
  totalRuns: number;
  successfulRuns: number;
}
