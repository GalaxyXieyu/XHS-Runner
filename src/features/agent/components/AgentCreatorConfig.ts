export type ImageGenProvider = 'jimeng' | 'jimeng-45' | 'gemini';

export const agentProgressMap: Record<string, number> = {
  supervisor: 5,
  research_agent: 20,
  style_analyzer_agent: 30,
  writer_agent: 45,
  image_planner_agent: 55,
  image_agent: 85,
  review_agent: 95,
};

const agentDisplayNames: Record<string, string> = {
  supervisor: '主管',
  supervisor_route: '任务路由',
  research_agent: '研究专家',
  writer_agent: '创作专家',
  style_analyzer_agent: '风格分析',
  image_planner_agent: '图片规划',
  image_agent: '图片生成',
  review_agent: '审核专家',
  tools: '工具调用',
};

export function getAgentDisplayName(name: string | undefined): string {
  if (!name) return '';
  return agentDisplayNames[name] || name;
}
