import { useState } from 'react';
import { cn } from '@/components/ui/utils';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  rightSlot?: React.ReactNode;
  disabled?: boolean;
}

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
  expanded,
  onToggle,
  className,
  headerClassName,
  contentClassName,
  rightSlot,
  disabled = false,
}: CollapsibleSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = typeof expanded === 'boolean';
  // 移除 useMemo，直接计算值，避免可能的循环问题
  const isExpanded = isControlled ? expanded : internalExpanded;

  const handleToggle = () => {
    if (disabled) return;
    if (onToggle) {
      onToggle();
      return;
    }
    setInternalExpanded((prev) => !prev);
  };

  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white/80 overflow-hidden', className)}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-xs text-slate-700 hover:text-slate-900 transition-colors',
          disabled && 'cursor-default text-slate-500 hover:text-slate-500',
          headerClassName
        )}
      >
        <div className="flex items-center gap-2">
          {title}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          {rightSlot}
          {!disabled && <span>{isExpanded ? '收起' : '展开'}</span>}
        </div>
      </button>
      {isExpanded && (
        <div className={cn('px-3 pb-3 space-y-2', contentClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
