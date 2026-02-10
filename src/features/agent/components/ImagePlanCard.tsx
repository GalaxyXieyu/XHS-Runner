/**
 * ImagePlanCard - 图片规划可视化卡片
 *
 * 用可视化方式展示 Image Planner Agent 生成的图片规划
 * 每张图片用一个迷你卡片展示角色、描述和提示词
 */

import { Image as ImageIcon, Layers, Link2 } from "lucide-react";
import { cn } from "@/components/ui/utils";

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

// ---------------------------------------------------------------------------
// 解析图片规划内容
// ---------------------------------------------------------------------------
export function parseImagePlanContent(content: string): ParsedImagePlan | null {
  if (!content || !content.trim()) return null;

  const blocks = Array.from(content.matchAll(/```json\s*([\s\S]*?)\s*```/g));
  if (blocks.length === 0) return null;

  const jsonBlock = blocks[blocks.length - 1]?.[1];
  if (!jsonBlock) return null;

  try {
    const parsed = JSON.parse(jsonBlock);
    const normalized: Record<string, any> =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, any>)
        : { imagePlans: parsed };

    const rawPlans = Array.isArray(normalized.imagePlans)
      ? normalized.imagePlans
      : Array.isArray(normalized.plans)
        ? normalized.plans
        : [];

    const plans: ImagePlan[] = rawPlans
      .map((item: any, idx: number) => ({
        sequence: Number.isFinite(item?.sequence) ? Number(item.sequence) : idx,
        role: String(item?.role || (idx === 0 ? "cover" : "detail")),
        description: item?.description ? String(item.description) : undefined,
        prompt: String(item?.prompt || "").trim(),
      }))
      .filter((item: ImagePlan) => !!item.prompt);

    if (plans.length === 0) return null;

    const paragraphImageBindings: ParagraphImageBinding[] = Array.isArray(
      normalized.paragraphImageBindings,
    )
      ? normalized.paragraphImageBindings.map((item: any, idx: number) => ({
          imageSeq: Number.isFinite(item?.imageSeq) ? Number(item.imageSeq) : idx,
          paragraphIds: Array.isArray(item?.paragraphIds)
            ? item.paragraphIds.map((v: unknown) => String(v))
            : [],
          rationale: item?.rationale ? String(item.rationale) : undefined,
        }))
      : [];

    const summary = content.substring(0, content.indexOf("```json")).trim();

    return { summary, plans, paragraphImageBindings };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 角色配置
// ---------------------------------------------------------------------------
interface RoleConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: string; // emoji
}

const ROLE_MAP: Record<string, RoleConfig> = {
  cover: {
    label: "封面图",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    icon: "🎨",
  },
  steps: {
    label: "步骤图",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    icon: "📝",
  },
  detail: {
    label: "细节图",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    icon: "🔍",
  },
  result: {
    label: "结果图",
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    icon: "✅",
  },
};

function getRoleConfig(role: string): RoleConfig {
  return (
    ROLE_MAP[role] || {
      label: role,
      bg: "bg-slate-50",
      text: "text-slate-700",
      border: "border-slate-200",
      icon: "📷",
    }
  );
}

// ---------------------------------------------------------------------------
// ImagePlanCard
// ---------------------------------------------------------------------------
export function ImagePlanCard({ imagePlan }: ImagePlanCardProps) {
  const bindingsBySeq = new Map<number, ParagraphImageBinding>();
  imagePlan.paragraphImageBindings.forEach((binding) => {
    bindingsBySeq.set(binding.imageSeq, binding);
  });

  return (
    <div className="space-y-2">
      {/* 摘要行 */}
      {imagePlan.summary && (
        <div className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
          <ImageIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          <span>{imagePlan.summary}</span>
        </div>
      )}

      {/* 规划卡片网格 */}
      <div className="grid grid-cols-2 gap-2">
        {imagePlan.plans.map((plan, i) => {
          const role = getRoleConfig(plan.role);
          const binding = bindingsBySeq.get(plan.sequence);
          return (
            <PlanMiniCard
              key={i}
              index={i}
              plan={plan}
              role={role}
              binding={binding}
            />
          );
        })}
      </div>

      {/* 段落绑定摘要 */}
      {imagePlan.paragraphImageBindings.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
          <Link2 className="w-3 h-3" />
          <span>
            已完成 {imagePlan.paragraphImageBindings.length} 条段落-图片映射
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 单个规划迷你卡片
// ---------------------------------------------------------------------------
interface PlanMiniCardProps {
  index: number;
  plan: ImagePlan;
  role: RoleConfig;
  binding?: ParagraphImageBinding;
}

function PlanMiniCard({ index, plan, role, binding }: PlanMiniCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg p-2.5 transition-all bg-white/90 shadow-sm hover:bg-slate-50/60",
        role.bg,
      )}
    >
      {/* 头部：序号 + 角色 */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-sm">{role.icon}</span>
        <span className={cn("text-[11px] font-semibold", role.text)}>
          {role.label}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto">#{index + 1}</span>
      </div>

      {/* 描述 */}
      {plan.description && (
        <div className="text-[11px] text-slate-600 leading-relaxed mb-1.5 line-clamp-2">
          {plan.description}
        </div>
      )}

      {/* 提示词摘要 */}
      <div className="text-[10px] font-normal text-slate-500 leading-relaxed line-clamp-3 bg-slate-50/50 rounded-lg px-1.5 py-1">
        {plan.prompt}
      </div>

      {/* 关联段落 */}
      {binding && binding.paragraphIds.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          <Layers className="w-2.5 h-2.5 text-gray-400" />
          <span className="text-[10px] text-slate-400">
            段落 {binding.paragraphIds.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
