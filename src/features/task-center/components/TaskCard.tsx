import { AlertCircle, CheckCircle2, CheckSquare, ChevronDown, ChevronUp, Loader, Square, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface MetadataItem {
  label: string;
  value: string | ReactNode;
  highlight?: boolean; // 是否高亮显示
}

interface ActionButton {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'warning' | 'danger' | 'default';
  disabled?: boolean;
  loading?: boolean;
}

interface TaskCardProps {
  title: string;
  typeBadge?: { label: string; bg: string; text: string };
  statusBadge: { label: string; bg: string; text: string; dot?: string };
  metadata: MetadataItem[];
  actions?: ActionButton[];
  progress?: { value: number; text?: string };
  error?: string;
  success?: string;
  onDelete?: () => void;
  deleteLoading?: boolean;
  // 选择功能
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  expandable?: {
    label: string;
    expanded: boolean;
    onToggle: () => void;
    content: ReactNode;
  };
}

const buttonVariants = {
  primary: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
  warning: 'bg-amber-50 text-amber-600 hover:bg-amber-100',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  default: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
};

export function TaskCard({
  title,
  typeBadge,
  statusBadge,
  metadata,
  actions,
  progress,
  error,
  success,
  onDelete,
  deleteLoading,
  selectable,
  selected,
  onToggleSelect,
  expandable,
}: TaskCardProps) {
  return (
    <div className={`p-4 bg-white rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200 ${
      selected ? 'border-blue-300 bg-blue-50/30' : 'border-gray-100 hover:border-gray-200'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {selectable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            >
              {selected ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          )}
          <div className="text-sm font-medium text-gray-900 truncate">{title}</div>
          {typeBadge && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] shrink-0 ${typeBadge.bg} ${typeBadge.text}`}>
              {typeBadge.label}
            </span>
          )}
        </div>
        <span className={`px-2.5 py-1 text-xs rounded-full shrink-0 ml-2 flex items-center gap-1.5 ${statusBadge.bg} ${statusBadge.text}`}>
          {statusBadge.dot && (
            <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
          )}
          {statusBadge.label}
        </span>
      </div>

      {/* Metadata Grid */}
      {metadata.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600 mt-3">
          {metadata.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-gray-400">{item.label}</span>
              <span className={item.highlight ? 'text-gray-900 font-medium' : 'text-gray-700'}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.max(0, Math.min(100, progress.value))}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
            <Loader className="w-3 h-3 animate-spin" />
            {progress.text || (progress.value > 0 ? `进度 ${progress.value}%` : '等待执行...')}
          </div>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="text-xs text-green-600 flex items-center gap-1 mt-2">
          <CheckCircle2 className="w-3 h-3" />
          {success}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded mt-2">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Actions */}
      {(actions && actions.length > 0) || onDelete ? (
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
          {actions?.map((action, idx) => (
            <button
              key={idx}
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 ${buttonVariants[action.variant || 'default']}`}
            >
              {action.loading && <Loader className="w-3 h-3 animate-spin" />}
              {action.label}
            </button>
          ))}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={deleteLoading}
              className="px-2 py-1 text-xs rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleteLoading ? <Loader className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      ) : null}

      {/* Expandable Section */}
      {expandable && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={expandable.onToggle}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {expandable.expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expandable.label}
          </button>
          {expandable.expanded && <div className="mt-2">{expandable.content}</div>}
        </div>
      )}
    </div>
  );
}
