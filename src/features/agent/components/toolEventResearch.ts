import type { AgentEvent } from '../types';

const LOCATION_KEYWORDS = [
  '上海', '北京', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '西安', '南京', '苏州', '厦门', '长沙', '青岛', '天津', '周边', '江浙沪', '本地', '同城',
];

export const RESEARCH_TOOL_NAMES = new Set([
  'searchnotes',
  'search_notes',
  'analyzetoptags',
  'analyze_tags',
  'gettoptitles',
  'get_top_titles',
  'websearch',
  'tavily_search',
]);

export interface ResearchNote {
  id?: number | string;
  title: string;
  desc?: string;
  likes: number;
  collects: number;
  comments: number;
  author?: string;
  url?: string;
  tags: string[];
}

export interface TagStat {
  tag: string;
  count: number;
  weight: number;
}

interface TitleSample {
  title: string;
  likes: number;
  collects: number;
  comments: number;
}

interface WebSearchResult {
  title: string;
  url?: string;
  content?: string;
  score?: number;
}

export interface TitlePattern {
  key: string;
  label: string;
  percent: number;
  examples: string[];
}

export interface ResearchDigest {
  query?: string;
  sortLabel?: string;
  noteCount: number;
  avgLikes: number;
  avgCollects: number;
  notes: ResearchNote[];
  tags: TagStat[];
  titlePatterns: TitlePattern[];
  webResults: WebSearchResult[];
  webAnswer?: string;
  webQuery?: string;
}

export interface MergedToolEvent {
  key: string;
  name: string;
  displayName: string;
  isComplete: boolean;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  content?: string;
}

export interface EvidenceSummary {
  summary: string;
  items: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => String(tag || '').replace(/^#/, '').trim())
      .filter(Boolean);
  }

  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,，#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function normalizeToolName(name?: string): string {
  return (name || '').trim().toLowerCase();
}

export function formatCompactNumber(value: unknown): string {
  const num = toNumber(value);
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}

export function trackNoteView(noteId?: number | string): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('agent:note-view', {
      detail: { noteId: noteId || null },
    }),
  );
}

function readSearchNotesOutput(output: unknown): { count: number; summary?: { avgLikes?: number; avgCollects?: number }; notes: ResearchNote[] } | null {
  const record = asRecord(output);
  if (!record) return null;

  const notesRaw = Array.isArray(record.notes) ? record.notes : [];
  const notes: ResearchNote[] = notesRaw
    .map((item): ResearchNote | null => {
      const note = asRecord(item);
      if (!note) return null;

      const title = String(note.title || '').trim();
      if (!title) return null;

      return {
        id: (note.id as number | string | undefined) || undefined,
        title,
        desc: typeof note.desc === 'string' ? note.desc : undefined,
        likes: toNumber(note.likes),
        collects: toNumber(note.collects),
        comments: toNumber(note.comments),
        author: typeof note.author === 'string' ? note.author : undefined,
        url: typeof note.url === 'string' ? note.url : undefined,
        tags: parseTags(note.tags),
      };
    })
    .filter((note): note is ResearchNote => note !== null);

  const summary = asRecord(record.summary);
  return {
    count: Math.max(toNumber(record.count), notes.length),
    summary: summary
      ? {
          avgLikes: toNumber(summary.avgLikes),
          avgCollects: toNumber(summary.avgCollects),
        }
      : undefined,
    notes,
  };
}

function readTopTagsOutput(output: unknown): { topTags: TagStat[] } | null {
  const record = asRecord(output);
  if (!record) return null;

  const topTagsRaw = Array.isArray(record.topTags) ? record.topTags : [];
  const topTags = topTagsRaw
    .map((item): TagStat | null => {
      const tag = asRecord(item);
      if (!tag) return null;

      const name = String(tag.tag || '').replace(/^#/, '').trim();
      if (!name) return null;

      return { tag: name, count: toNumber(tag.count), weight: toNumber(tag.weight) };
    })
    .filter((item): item is TagStat => item !== null)
    .sort((a, b) => b.count - a.count);

  return { topTags };
}

function readTopTitlesOutput(output: unknown): { titles: TitleSample[] } | null {
  const record = asRecord(output);
  if (!record) return null;

  const titlesRaw = Array.isArray(record.titles) ? record.titles : [];
  const titles = titlesRaw
    .map((item) => {
      const title = asRecord(item);
      if (!title) return null;

      const text = String(title.title || '').trim();
      if (!text) return null;

      return {
        title: text,
        likes: toNumber(title.likes),
        collects: toNumber(title.collects),
        comments: toNumber(title.comments),
      };
    })
    .filter((item): item is TitleSample => !!item);

  return { titles };
}

function readWebSearchOutput(output: unknown): { query?: string; answer?: string; results: WebSearchResult[] } | null {
  const record = asRecord(output);
  if (!record) return null;

  const resultsRaw = Array.isArray(record.results) ? record.results : [];
  const results = resultsRaw
    .map((item): WebSearchResult | null => {
      const result = asRecord(item);
      if (!result) return null;

      const title = String(result.title || '').trim();
      if (!title) return null;

      return {
        title,
        url: typeof result.url === 'string' ? result.url : undefined,
        content: typeof result.content === 'string' ? result.content : undefined,
        score: Number.isFinite(Number(result.score)) ? Number(result.score) : undefined,
      };
    })
    .filter((item): item is WebSearchResult => item !== null);

  return {
    query: typeof record.query === 'string' ? record.query : undefined,
    answer: typeof record.answer === 'string' ? record.answer : undefined,
    results,
  };
}

function calculateTitlePatterns(titles: TitleSample[]): TitlePattern[] {
  const total = titles.length;
  if (!total) return [];

  const collectPattern = (key: string, label: string, matcher: (title: string) => boolean): TitlePattern => {
    const matched = titles.filter((item) => matcher(item.title));
    const percent = Math.round((matched.length / total) * 100);
    return {
      key,
      label,
      percent,
      examples: matched.slice(0, 2).map((item) => item.title),
    };
  };

  return [
    collectPattern('question', '疑问句开头', (title) => /[？?]/.test(title)),
    collectPattern('exclaim', '包含感叹号', (title) => /[！!]/.test(title)),
    collectPattern('number', '包含数字', (title) => /\d+/.test(title)),
    collectPattern('location', '包含地域词', (title) => LOCATION_KEYWORDS.some((keyword) => title.includes(keyword))),
  ];
}

export function mergeToolEvents(events: AgentEvent[], getDisplayName: (rawName: string) => string): MergedToolEvent[] {
  const toolEvents = events.filter((event) => event.type === 'tool_call' || event.type === 'tool_result');
  const merged: MergedToolEvent[] = [];
  const pendingByName = new Map<string, number[]>();

  const pushPending = (name: string, index: number) => {
    const key = normalizeToolName(name);
    const queue = pendingByName.get(key) || [];
    queue.push(index);
    pendingByName.set(key, queue);
  };

  const popPending = (name: string): number | undefined => {
    const key = normalizeToolName(name);
    const queue = pendingByName.get(key);
    if (!queue || queue.length === 0) return undefined;

    const idx = queue.shift();
    if (queue.length === 0) pendingByName.delete(key);
    else pendingByName.set(key, queue);
    return idx;
  };

  for (const event of toolEvents) {
    const name = event.tool || event.agent || '';
    const displayName = getDisplayName(name);

    if (event.type === 'tool_call') {
      const idx = merged.length;
      merged.push({
        key: `${name}-${event.toolCallId || event.timestamp || idx}`,
        name,
        displayName,
        isComplete: false,
        toolInput: event.toolInput,
        content: event.content,
      });
      pushPending(name, idx);
      continue;
    }

    const idx = popPending(name);
    const parsedOutput = parseMaybeJson(event.toolOutput !== undefined ? event.toolOutput : event.content);

    if (idx === undefined) {
      merged.push({
        key: `${name}-${event.toolCallId || event.timestamp || merged.length}`,
        name,
        displayName,
        isComplete: true,
        toolOutput: parsedOutput,
        content: event.content,
      });
      continue;
    }

    merged[idx] = {
      ...merged[idx],
      isComplete: true,
      toolOutput: parsedOutput,
      content: event.content,
    };
  }

  return merged;
}

export function buildResearchDigest(mergedEvents: MergedToolEvent[]): ResearchDigest | null {
  const getLatestByNames = (names: string[]): MergedToolEvent | null => {
    for (let i = mergedEvents.length - 1; i >= 0; i -= 1) {
      const normalized = normalizeToolName(mergedEvents[i].name);
      if (names.includes(normalized)) return mergedEvents[i];
    }
    return null;
  };

  const searchOutput = readSearchNotesOutput(getLatestByNames(['searchnotes', 'search_notes'])?.toolOutput);
  const tagOutput = readTopTagsOutput(getLatestByNames(['analyzetoptags', 'analyze_tags'])?.toolOutput);
  const titleOutput = readTopTitlesOutput(getLatestByNames(['gettoptitles', 'get_top_titles'])?.toolOutput);
  const webSearchOutput = readWebSearchOutput(getLatestByNames(['websearch', 'tavily_search'])?.toolOutput);

  if (!searchOutput && !tagOutput && !titleOutput && !webSearchOutput) return null;

  const searchInput = (getLatestByNames(['searchnotes', 'search_notes'])?.toolInput || {}) as Record<string, unknown>;
  const query = typeof searchInput.query === 'string' ? searchInput.query : undefined;
  const notes = (searchOutput?.notes || []).slice().sort((a, b) => b.likes - a.likes);
  const noteCount = searchOutput?.count || notes.length;

  const avgLikes =
    searchOutput?.summary?.avgLikes ??
    (notes.length ? Math.round(notes.reduce((sum, note) => sum + note.likes, 0) / notes.length) : 0);
  const avgCollects =
    searchOutput?.summary?.avgCollects ??
    (notes.length ? Math.round(notes.reduce((sum, note) => sum + note.collects, 0) / notes.length) : 0);

  return {
    query,
    sortLabel: '点赞降序',
    noteCount,
    avgLikes,
    avgCollects,
    notes,
    tags: tagOutput?.topTags || [],
    titlePatterns: calculateTitlePatterns(titleOutput?.titles || []),
    webResults: webSearchOutput?.results || [],
    webAnswer: webSearchOutput?.answer,
    webQuery: webSearchOutput?.query,
  };
}

export function parseEvidenceSummary(rawContent?: string): EvidenceSummary | null {
  if (!rawContent) return null;

  const parsed = parseMaybeJson(rawContent);
  const record = asRecord(parsed);
  if (!record) {
    const lines = rawContent
      .split(/\n+/)
      .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!lines.length) return null;
    return { summary: lines[0], items: lines.slice(1) };
  }

  const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
  const itemsRaw = Array.isArray(record.items) ? record.items : [];
  const items = itemsRaw
    .map((item) => {
      const fact = asRecord(item)?.fact;
      return typeof fact === 'string' ? fact.trim() : '';
    })
    .filter(Boolean)
    .slice(0, 6);

  if (!summary && items.length === 0) return null;
  return { summary: summary || items[0] || '研究摘要', items };
}
