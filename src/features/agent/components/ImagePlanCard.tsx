/**
 * ImagePlanCard - 图片规划卡片组件
 * 
 * 显示 Image Planner Agent 生成的图片规划
 */

import { Image } from "lucide-react";

export interface ImagePlan {
  sequence: number;
  role: string;
  description?: string;
  prompt: string;
}

export interface ParsedImagePlan {
  summary: string;
  plans: ImagePlan[];
}

export interface ImagePlanCardProps {
  imagePlan: ParsedImagePlan;
}

/**
 * 解析图片规划内容
 */
export function parseImagePlanContent(content: string): ParsedImagePlan | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    const plans = JSON.parse(jsonMatch[1]);
    const summary = content.substring(0, content.indexOf('```json')).trim();
    return { summary, plans };
  } catch {
    return null;
  }
}

/**
 * 获取图片角色的中文名称
 */
function getRoleName(role: string): string {
  const roleMap: Record<string, string> = {
    cover: '封面图',
    steps: '步骤图',
    result: '结果图',
  };
  return roleMap[role] || role;
}

export function ImagePlanCard({ imagePlan }: ImagePlanCardProps) {
  return (
    <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
      {/* 摘要区 */}
      <div className="px-4 py-3 bg-purple-50/50 border-b border-purple-100">
        <div className="flex items-center gap-2 mb-2">
          <Image className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-900">图片规划</span>
        </div>
        {imagePlan.summary && (
          <div className="text-xs text-purple-700 leading-relaxed whitespace-pre-wrap">
            {imagePlan.summary}
          </div>
        )}
      </div>

      {/* 规划列表 */}
      <div className="px-4 py-3">
        <div className="space-y-2">
          {imagePlan.plans.map((plan, i) => (
            <ImagePlanItem key={i} plan={plan} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ImagePlanItemProps {
  plan: ImagePlan;
}

function ImagePlanItem({ plan }: ImagePlanItemProps) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
          {plan.sequence + 1}
        </span>
        <span className="text-xs font-medium text-gray-700">
          {getRoleName(plan.role)}
        </span>
        {plan.description && (
          <span className="text-xs text-gray-500">· {plan.description}</span>
        )}
      </div>
      <div className="text-xs text-gray-600 leading-relaxed max-h-32 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        {plan.prompt}
      </div>
    </div>
  );
}
