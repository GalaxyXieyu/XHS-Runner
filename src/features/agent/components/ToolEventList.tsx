import { cn } from '@/components/ui/utils';
import { ChevronRight, ExternalLink, X } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';
import type { AgentEvent } from '../types';
import {
  RESEARCH_TOOL_NAMES,
  buildResearchDigest,
  formatCompactNumber,
  mergeToolEvents,
  normalizeToolName,
  parseEvidenceSummary,
  trackNoteView,
  type MergedToolEvent,
  type ResearchNote,
} from './toolEventResearch';

const NAME_MAP: Record<string, string> = {
  // 工具名（camelCase）
  searchNotes: '搜索笔记',
  analyzeTopTags: '分析热门标签',
  getTrendReport: '获取趋势报告',
  getTopTitles: '获取爆款标题',
  generateImage: '生成单张图片',
  generate_images: '批量生成图片',
  generate_images_batch: '批量生成图片（串行）',
  generate_with_reference: '参考图生成',
  analyzeReferenceImage: '分析参考图风格',
  saveImagePlan: '保存图片规划',
  webSearch: '联网搜索',
  askUser: '询问用户',
  managePrompt: '管理提示词模板',
  recommendTemplates: '推荐模板',
  save_creative: '保存创作',

  // 工具名（snake_case / 归一化）
  search_notes: '搜索笔记',
  searchnotes: '搜索笔记',
  analyze_notes: '分析笔记',
  analyze_tags: '分析标签',
  analyzetoptags: '分析热门标签',
  get_top_titles: '获取爆款标题',
  gettoptitles: '获取爆款标题',
  generate_content: '生成内容',
  web_search: '联网搜索',
  tavily_search: '联网搜索',
  ask_user: '询问用户',
  manage_prompt: '管理提示词模板',
  recommend_templates: '推荐模板',
  save_image_plan: '保存图片规划',

  // Agent 节点
  brief_compiler_agent: '任务梳理专家',
  research_evidence_agent: '证据研究专家',
  reference_intelligence_agent: '参考图智能专家',
  layout_planner_agent: '版式规划专家',
  research_agent: '研究专家',
  writer_agent: '创作专家',
  image_agent: '图片生成专家',
  image_planner_agent: '图片规划专家',
  style_analyzer_agent: '风格分析专家',
  review_agent: '审核专家',
  supervisor: '主管',
  supervisor_route: '任务路由',

  // ToolNode / 组合节点
  research_evidence_tools: '证据研究工具',
  reference_intelligence_tools: '参考图分析工具',
  image_planner_tools: '图片规划工具',
  image_tools: '图片生成工具',
  writer_tools: '创作工具',
  review_tools: '审核工具',
};

const NORMALIZED_NAME_MAP: Record<string, string> = Object.entries(NAME_MAP).reduce((acc, [key, value]) => {
  acc[normalizeToolName(key)] = value;
  return acc;
}, {} as Record<string, string>);

export function getDisplayName(rawName: string): string {
  if (!rawName) return rawName;
  return NAME_MAP[rawName] || NORMALIZED_NAME_MAP[normalizeToolName(rawName)] || rawName;
}

interface ToolEventItemProps {
  item: MergedToolEvent;
}

function ToolEventItem({ item }: ToolEventItemProps) {
  return (
    <div className="px-3 py-2 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-2">
        {item.isComplete ? (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-600">完成</span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-600 inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            处理中
          </span>
        )}
        <span className="text-xs font-medium text-gray-700">{item.displayName}</span>
      </div>
    </div>
  );
}

interface NotePreviewModalProps {
  note: ResearchNote | null;
  onClose: () => void;
}

function NotePreviewModal({ note, onClose }: NotePreviewModalProps) {
  if (!note) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 break-words">{note.title}</h4>
            <p className="mt-1 text-xs text-gray-500">
              {note.author ? `${note.author} · ` : ''}
              点赞 {formatCompactNumber(note.likes)} · 收藏 {formatCompactNumber(note.collects)} · 评论 {formatCompactNumber(note.comments)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭预览"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {note.desc && <p className="mt-3 text-xs leading-5 text-gray-700 whitespace-pre-wrap">{note.desc}</p>}

        {note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {note.tags.slice(0, 8).map((tag) => (
              <span key={`${note.id || note.title}-${tag}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {note.url && (
          <div className="mt-4">
            <a
              href={note.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
              onClick={() => trackNoteView(note.id)}
            >
              打开原文
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export interface ToolEventListProps {
  events: AgentEvent[];
  maxHeight?: string;
}

export function ToolEventList({ events, maxHeight = 'max-h-96' }: ToolEventListProps) {
  const mergedEvents = useMemo(() => mergeToolEvents(events, getDisplayName), [events]);
  if (mergedEvents.length === 0) return null;

  return (
    <div className={cn('bg-white border-t border-gray-100 overflow-y-auto', maxHeight)}>
      <div className="divide-y divide-gray-50">
        {mergedEvents.map((item) => (
          <ToolEventItem key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

export interface CollapsibleToolCardProps {
  title: string;
  events: AgentEvent[];
  isLoading?: boolean;
  expanded: boolean;
  onToggle: () => void;
  phase?: string;
  researchContent?: string;
  containerRef?: RefObject<HTMLDivElement>;
  highlight?: boolean;
}

export function CollapsibleToolCard({
  title,
  events,
  isLoading = false,
  expanded,
  onToggle,
  phase,
  researchContent,
  containerRef,
  highlight = false,
}: CollapsibleToolCardProps) {
  const mergedEvents = useMemo(() => mergeToolEvents(events, getDisplayName), [events]);
  const latestItem = mergedEvents.length > 0 ? mergedEvents[mergedEvents.length - 1] : null;
  const latestStatus = latestItem ? (latestItem.isComplete ? '已完成' : '处理中') : '';
  const researchDigest = useMemo(() => buildResearchDigest(mergedEvents), [mergedEvents]);
  const parsedEvidence = useMemo(() => parseEvidenceSummary(researchContent), [researchContent]);

  const [showAllTags, setShowAllTags] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<ResearchNote | null>(null);

  const hasResearchData = Boolean(researchDigest);
  const isResearchCard = title === '研究过程' || mergedEvents.some((item) => RESEARCH_TOOL_NAMES.has(normalizeToolName(item.name)));

  const visibleTags = showAllTags ? researchDigest?.tags || [] : (researchDigest?.tags || []).slice(0, 10);
  const filteredNotes = useMemo(() => {
    if (!researchDigest) return [];
    if (!selectedTag) return researchDigest.notes;
    return researchDigest.notes.filter((note) => note.tags.includes(selectedTag));
  }, [researchDigest, selectedTag]);

  const summaryLine = useMemo(() => {
    if (!researchDigest) return `${mergedEvents.length} 个步骤`;
    return [
      `${researchDigest.noteCount} 篇笔记`,
      `${researchDigest.webResults.length} 条联网结果`,
      `${researchDigest.tags.length} 个热门标签`,
      `${researchDigest.titlePatterns.filter((item) => item.percent > 0).length} 条标题规律`,
    ].join(' · ');
  }, [mergedEvents.length, researchDigest]);

  const maxTagCount = Math.max(...(researchDigest?.tags.map((tag) => tag.count) || [1]));

  return (
    <div
      ref={containerRef}
      className={cn(
        'border border-gray-200 rounded-lg overflow-hidden transition-shadow duration-300',
        highlight && 'ring-2 ring-yellow-400',
        !highlight && isResearchCard && expanded && 'ring-2 ring-blue-500',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50/50 hover:bg-blue-50 transition-colors text-left"
      >
        {isLoading ? (
          <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
        ) : (
          <ChevronRight className={cn('w-3.5 h-3.5 text-blue-500 transition-transform', expanded && 'rotate-90')} />
        )}

        <span className="text-xs font-medium text-blue-700">
          {!isLoading && isResearchCard && !expanded && hasResearchData ? '研究收集完成' : title}
        </span>

        {(phase || latestItem) && (
          <span className="text-xs text-blue-500 ml-1 truncate">· {phase || `${latestItem?.displayName} ${latestStatus}`}</span>
        )}

        <span className="text-xs text-gray-400 ml-auto truncate">{!expanded && isResearchCard ? summaryLine : `${mergedEvents.length} 个步骤`}</span>
      </button>

      {expanded && (
        <>
          {hasResearchData && researchDigest && (
            <div className="border-t border-gray-100 bg-white p-3 space-y-3">
              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-800">搜索摘要</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                  <div className="rounded-md bg-gray-50 px-2 py-1.5">
                    <div className="text-gray-400">关键词</div>
                    <div className="mt-0.5 truncate">{researchDigest.query || '-'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 px-2 py-1.5">
                    <div className="text-gray-400">排序</div>
                    <div className="mt-0.5">{researchDigest.sortLabel || '-'}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 px-2 py-1.5">
                    <div className="text-gray-400">平均点赞</div>
                    <div className="mt-0.5">{formatCompactNumber(researchDigest.avgLikes)}</div>
                  </div>
                  <div className="rounded-md bg-gray-50 px-2 py-1.5">
                    <div className="text-gray-400">平均收藏</div>
                    <div className="mt-0.5">{formatCompactNumber(researchDigest.avgCollects)}</div>
                  </div>
                </div>
              </section>

              {researchDigest.webResults.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-800">联网检索结果</h4>
                  {researchDigest.webAnswer && (
                    <p className="text-[11px] text-gray-600 bg-gray-50 rounded-md px-2 py-1.5">{researchDigest.webAnswer}</p>
                  )}

                  <div className="space-y-1.5">
                    {researchDigest.webResults.slice(0, 3).map((result, index) => (
                      <div key={`${result.url || result.title}-${index}`} className="rounded-md border border-gray-100 p-2 bg-gray-50/60">
                        {result.url ? (
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
                          >
                            {result.title}
                          </a>
                        ) : (
                          <div className="text-xs font-medium text-gray-900">{result.title}</div>
                        )}
                        {result.content && <p className="mt-1 text-[11px] text-gray-500 line-clamp-2">{result.content}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {researchDigest.notes.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-800">
                    相关笔记
                    {selectedTag && <span className="ml-1 text-[11px] text-blue-600">(标签：#{selectedTag})</span>}
                  </h4>

                  <div className="space-y-1.5">
                    {filteredNotes.slice(0, 5).map((note, index) => (
                      <div key={`${note.id || note.title}-${index}`} className="rounded-md border border-gray-100 p-2 bg-gray-50/60">
                        <button
                          type="button"
                          onClick={() => setPreviewNote(note)}
                          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                          aria-label={`预览笔记：${note.title}`}
                        >
                          <div className="text-xs font-medium text-gray-900 line-clamp-1">{note.title}</div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            {note.author ? `${note.author} · ` : ''}
                            点赞 {formatCompactNumber(note.likes)} · 评论 {formatCompactNumber(note.comments)}
                          </div>
                        </button>
                        {note.url && (
                          <a
                            href={note.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
                            onClick={() => trackNoteView(note.id)}
                          >
                            查看原文
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}

                    {selectedTag && filteredNotes.length === 0 && (
                      <div className="text-[11px] text-gray-500 rounded-md border border-dashed border-gray-200 px-2 py-2">
                        该标签下暂无已返回的笔记。
                      </div>
                    )}
                  </div>
                </section>
              )}

              {researchDigest.tags.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-gray-800">热门标签</h4>
                    <button type="button" onClick={() => setShowAllTags((prev) => !prev)} className="text-[11px] text-blue-600 hover:text-blue-700">
                      {showAllTags ? '收起' : `展开全部 ${researchDigest.tags.length} 个`}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {visibleTags.map((tag) => {
                      const ratio = maxTagCount > 0 ? tag.count / maxTagCount : 0;
                      const fontSize = 12 + ratio * 6;
                      const isSelected = selectedTag === tag.tag;

                      return (
                        <button
                          key={tag.tag}
                          type="button"
                          onClick={() => setSelectedTag((prev) => (prev === tag.tag ? null : tag.tag))}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors',
                            isSelected ? 'border-blue-200 bg-blue-100 text-blue-700' : 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100',
                          )}
                          style={{ fontSize: `${fontSize}px` }}
                        >
                          #{tag.tag}
                          <span className="text-[10px] text-blue-500">{tag.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {researchDigest.titlePatterns.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-800">标题规律</h4>
                  <div className="space-y-2">
                    {researchDigest.titlePatterns.map((pattern) => (
                      <div key={pattern.key} className="rounded-md bg-gray-50 px-2 py-2">
                        <div className="flex items-center justify-between text-[11px] text-gray-700">
                          <span>{pattern.label}</span>
                          <span>{pattern.percent}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${pattern.percent}%` }} />
                        </div>
                        {pattern.examples.length > 0 && (
                          <div className="mt-1 text-[11px] text-gray-500 line-clamp-1">示例：{pattern.examples.join(' / ')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          <ToolEventList events={events} maxHeight="max-h-56" />

          {parsedEvidence && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              <div className="text-xs text-gray-400 mb-1">研究总结</div>
              <div className="text-xs text-gray-600">{parsedEvidence.summary}</div>
              {parsedEvidence.items.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {parsedEvidence.items.slice(0, 4).map((item, index) => (
                    <li key={`${index}-${item}`} className="text-[11px] text-gray-500">- {item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <NotePreviewModal note={previewNote} onClose={() => setPreviewNote(null)} />
    </div>
  );
}
