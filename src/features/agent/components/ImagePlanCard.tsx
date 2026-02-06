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

export interface ParagraphImageBinding {
  imageSeq: number;
  paragraphIds: string[];
  rationale?: string;
}

export interface ParsedImagePlan {
  summary: string;
  plans: ImagePlan[];
  paragraphImageBindings: ParagraphImageBinding[];
}

export interface ImagePlanCardProps {
  imagePlan: ParsedImagePlan;
}

/**
 * 解析图片规划内容（兼容旧数组格式与新对象格式）
 */
export function parseImagePlanContent(content: string): ParsedImagePlan | null {
  if (!content || !content.trim()) return null;

  const blocks = Array.from(content.matchAll(/```json\s*([\s\S]*?)\s*```/g));
  if (blocks.length === 0) return null;

  const jsonBlock = blocks[blocks.length - 1]?.[1];
  if (!jsonBlock) return null;

  try {
    const parsed = JSON.parse(jsonBlock);
    const normalized: Record<string, any> = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      ? parsed as Record<string, any>
      : { imagePlans: parsed };

    const rawPlans = Array.isArray(normalized.imagePlans)
      ? normalized.imagePlans
      : (Array.isArray(normalized.plans) ? normalized.plans : []);

    const plans: ImagePlan[] = rawPlans
      .map((item: any, idx: number) => ({
        sequence: Number.isFinite(item?.sequence) ? Number(item.sequence) : idx,
        role: String(item?.role || (idx === 0 ? "cover" : "detail")),
        description: item?.description ? String(item.description) : undefined,
        prompt: String(item?.prompt || "").trim(),
      }))
      .filter((item: ImagePlan) => !!item.prompt);

    if (plans.length === 0) return null;

    const paragraphImageBindings: ParagraphImageBinding[] = Array.isArray(normalized.paragraphImageBindings)
      ? normalized.paragraphImageBindings.map((item: any, idx: number) => ({
          imageSeq: Number.isFinite(item?.imageSeq) ? Number(item.imageSeq) : idx,
          paragraphIds: Array.isArray(item?.paragraphIds)
            ? item.paragraphIds.map((v: unknown) => String(v))
            : [],
          rationale: item?.rationale ? String(item.rationale) : undefined,
        }))
      : [];

    const summary = content.substring(0, content.indexOf("```json")).trim();

    return {
      summary,
      plans,
      paragraphImageBindings,
    };
  } catch {
    return null;
  }
}

/**
 * 获取图片角色的中文名称
 */
function getRoleName(role: string): string {
  const roleMap: Record<string, string> = {
    cover: "封面图",
    steps: "步骤图",
    detail: "细节图",
    result: "结果图",
  };
  return roleMap[role] || role;
}

export function ImagePlanCard({ imagePlan }: ImagePlanCardProps) {
  const bindingsBySeq = new Map<number, ParagraphImageBinding>();
  imagePlan.paragraphImageBindings.forEach((binding) => {
    bindingsBySeq.set(binding.imageSeq, binding);
  });

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
            <ImagePlanItem key={i} plan={plan} binding={bindingsBySeq.get(plan.sequence)} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ImagePlanItemProps {
  plan: ImagePlan;
  binding?: ParagraphImageBinding;
}

function ImagePlanItem({ plan, binding }: ImagePlanItemProps) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
          {plan.sequence + 1}
        </span>
        <span className="text-xs font-medium text-gray-700">
          {getRoleName(plan.role)}
        </span>
        {plan.description && (
          <span className="text-xs text-gray-500">· {plan.description}</span>
        )}
        {binding && binding.paragraphIds.length > 0 && (
          <span className="text-xs text-indigo-600">· 段落 {binding.paragraphIds.join(", ")}</span>
        )}
      </div>
      <div className="text-xs text-gray-600 leading-relaxed max-h-32 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
        {plan.prompt}
      </div>
    </div>
  );
}
