import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Search,
  Pen,
  LayoutGrid,
  ImageIcon,
  Palette,
  ShieldCheck,
  Zap,
  Eye,
  Sparkles,
} from 'lucide-react';

export type ImageGenProvider = 'jimeng' | 'jimeng-45' | 'gemini';

const agentIconMap: Record<string, LucideIcon> = {
  brief_compiler_agent: FileText,
  research_evidence_agent: Search,
  research_agent: Search,
  reference_intelligence_agent: Eye,
  writer_agent: Pen,
  layout_planner_agent: LayoutGrid,
  image_planner_agent: ImageIcon,
  image_agent: Palette,
  review_agent: ShieldCheck,
  style_analyzer_agent: Sparkles,
};

/**
 * 获取 agent 对应的 Lucide 图标组件
 */
export function getAgentIcon(name: string | undefined): LucideIcon {
  if (!name) return Zap;
  return agentIconMap[name] || Zap;
}

export const agentProgressMap: Record<string, number> = {
  supervisor: 5,
  brief_compiler_agent: 10,
  research_evidence_agent: 20,
  reference_intelligence_agent: 30,
  writer_agent: 42,
  layout_planner_agent: 52,
  image_planner_agent: 62,
  image_agent: 85,
  review_agent: 95,
  research_agent: 20,
  style_analyzer_agent: 30,
};

const agentDisplayNames: Record<string, string> = {
  supervisor: '主管',
  supervisor_route: '任务路由',
  brief_compiler_agent: '任务梳理',
  research_evidence_agent: '证据研究',
  reference_intelligence_agent: '参考图智能',
  layout_planner_agent: '版式规划',
  research_agent: '研究专家',
  writer_agent: '创作专家',
  style_analyzer_agent: '风格分析',
  image_planner_agent: '图片规划',
  image_agent: '图片生成',
  review_agent: '审核专家',
  tools: '工具调用',
  // 工具节点（LangGraph 节点名）
  research_evidence_tools: '证据研究',
  reference_intelligence_tools: '参考图分析',
  image_planner_tools: '图片规划工具',
  image_tools: '图片生成',
  writer_tools: '创作工具',
  review_tools: '审核工具',
};

export function getAgentDisplayName(name: string | undefined): string {
  if (!name) return '';
  return agentDisplayNames[name] || name;
}

