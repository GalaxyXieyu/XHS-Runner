import { getPrimaryClusterSummary, SummaryPayload } from '../llm/summaryService';
import { getSetting } from '../../../settings';

export interface KnowledgeProvider {
  summarize(themeId: number, windowDays: number): Promise<SummaryPayload | null>;
  search(themeId: number, query: string, limit: number): Promise<any[]>;
}

export class LocalSummaryProvider implements KnowledgeProvider {
  async summarize(themeId: number, windowDays: number): Promise<SummaryPayload | null> {
    return getPrimaryClusterSummary(themeId, windowDays);
  }

  async search(): Promise<any[]> {
    return [];
  }
}

export class GraphitiProvider implements KnowledgeProvider {
  constructor(private baseUrl: string) {}

  async summarize(themeId: number, windowDays: number): Promise<SummaryPayload | null> {
    const response = await fetch(`${this.baseUrl}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId, windowDays }),
    });
    if (!response.ok) {
      throw new Error(`Graphiti summarize failed: ${response.status}`);
    }
    return response.json();
  }

  async search(themeId: number, query: string, limit: number): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId, query, limit }),
    });
    if (!response.ok) {
      throw new Error(`Graphiti search failed: ${response.status}`);
    }
    return response.json();
  }
}

export async function getKnowledgeProvider(): Promise<KnowledgeProvider> {
  const configured = (await getSetting('graphitiBaseUrl')) || process.env.GRAPHITI_BASE_URL;
  if (configured) {
    return new GraphitiProvider(String(configured));
  }
  return new LocalSummaryProvider();
}
