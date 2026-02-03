/**
 * ToolEventList - 工具调用事件列表组件
 * 
 * 显示 Agent 执行过程中的工具调用和结果
 * 可用于研究过程卡片和加载状态卡片
 */

import { ChevronRight } from "lucide-react";
import type { AgentEvent } from "../types";

// 工具/Agent 名称中文映射
const NAME_MAP: Record<string, string> = {
  // XHS 数据工具
  searchNotes: "搜索笔记",
  analyzeTopTags: "分析热门标签",
  getTrendReport: "获取趋势报告",
  getTopTitles: "获取爆款标题",
  // 图片生成工具
  generateImage: "生成单张图片",
  generate_images: "批量生成图片",
  generate_images_batch: "批量生成图片（串行）",
  generate_with_reference: "参考图生成",
  analyzeReferenceImage: "分析参考图风格",
  saveImagePlan: "保存图片规划",
  // 通用工具
  webSearch: "联网搜索",
  askUser: "询问用户",
  managePrompt: "管理提示词模板",
  recommendTemplates: "推荐模板",
  save_creative: "保存创作",
  // Agent 名称
  research_agent: "研究专家",
  writer_agent: "创作专家",
  image_agent: "图片生成专家",
  image_planner_agent: "图片规划专家",
  style_analyzer_agent: "风格分析专家",
  review_agent: "审核专家",
  supervisor: "主管",
  supervisor_route: "任务路由",
  // 兼容旧名称
  search_notes: "搜索笔记",
  analyze_notes: "分析笔记",
  analyze_tags: "分析标签",
  get_top_titles: "获取爆款标题",
  generate_content: "生成内容",
  tavily_search: "联网搜索",
};

export function getDisplayName(rawName: string): string {
  return NAME_MAP[rawName] || rawName;
}

interface MergedToolEvent {
  name: string;
  displayName: string;
  isComplete: boolean;
  content?: string;
}

/**
 * 合并 tool_call 和 tool_result 事件
 * 同一个工具只显示一个卡片，状态动态变化
 */
function mergeToolEvents(events: AgentEvent[]): MergedToolEvent[] {
  const toolEvents = events.filter(e => e.type === "tool_call" || e.type === "tool_result");
  const merged: MergedToolEvent[] = [];
  const pendingCalls = new Map<string, number>(); // name -> index in merged

  for (const event of toolEvents) {
    const name = event.tool || event.agent || "";
    
    if (event.type === "tool_call") {
      // 新的调用
      const idx = merged.length;
      merged.push({
        name,
        displayName: getDisplayName(name),
        isComplete: false,
        content: event.content,
      });
      pendingCalls.set(name, idx);
    } else if (event.type === "tool_result") {
      // 查找对应的调用并更新状态
      const idx = pendingCalls.get(name);
      if (idx !== undefined) {
        merged[idx].isComplete = true;
        pendingCalls.delete(name);
      }
    }
  }

  return merged;
}

interface ToolEventItemProps {
  item: MergedToolEvent;
}

function ToolEventItem({ item }: ToolEventItemProps) {
  return (
    <div className="px-3 py-2 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-2">
        {item.isComplete ? (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            完成
          </span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-600 flex items-center gap-1">
            <div className="w-2.5 h-2.5 border-2 border-blue-400 border-t-blue-600 rounded-full animate-spin" />
            调用中
          </span>
        )}
        <span className="text-xs font-medium text-gray-700">
          {item.displayName}
        </span>
      </div>
    </div>
  );
}

export interface ToolEventListProps {
  events: AgentEvent[];
  maxHeight?: string;
}

export function ToolEventList({ events, maxHeight = "max-h-96" }: ToolEventListProps) {
  const mergedEvents = mergeToolEvents(events);
  
  if (mergedEvents.length === 0) return null;

  return (
    <div className={`bg-white border-t border-gray-100 ${maxHeight} overflow-y-auto`}>
      <div className="divide-y divide-gray-50">
        {mergedEvents.map((item, i) => (
          <ToolEventItem key={i} item={item} />
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
}

/**
 * 可折叠的工具调用卡片
 * 用于研究过程展示和加载状态
 */
export function CollapsibleToolCard({
  title,
  events,
  isLoading = false,
  expanded,
  onToggle,
  phase,
  researchContent,
}: CollapsibleToolCardProps) {
  const mergedEvents = mergeToolEvents(events);
  const latestItem = mergedEvents.length > 0 ? mergedEvents[mergedEvents.length - 1] : null;
  const latestStatus = latestItem 
    ? (latestItem.isComplete ? "完成" : "调用中") 
    : "";

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50/50 hover:bg-blue-50 transition-colors text-left"
      >
        {isLoading ? (
          <div className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
        ) : (
          <ChevronRight className={`w-3.5 h-3.5 text-blue-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
        )}
        <span className="text-xs font-medium text-blue-700">{title}</span>
        
        {/* 显示最新步骤或阶段 */}
        {(phase || latestItem) && (
          <span className="text-xs text-blue-500 ml-1">
            · {phase || `${latestItem?.displayName} ${latestStatus}`}
          </span>
        )}
        
        {/* 显示步骤总数 */}
        {mergedEvents.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            {mergedEvents.length} 个步骤
          </span>
        )}
      </button>
      
      {expanded && (
        <>
          <ToolEventList events={events} />
          
          {/* 研究内容总结 */}
          {researchContent && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              <div className="text-xs text-gray-400 mb-1">研究总结</div>
              <div className="text-xs text-gray-600 whitespace-pre-wrap">{researchContent}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
