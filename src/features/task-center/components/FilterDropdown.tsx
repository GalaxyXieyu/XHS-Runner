import * as Popover from '@radix-ui/react-popover';
import { Filter, X, ChevronDown } from 'lucide-react';

interface FilterOption {
  id: string;
  label: string;
  value: string;
}

interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface FilterDropdownProps {
  groups: FilterGroup[];
}

export function FilterDropdown({ groups }: FilterDropdownProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="h-7 px-2.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md flex items-center gap-1.5 transition-colors">
          <Filter className="w-3.5 h-3.5" />
          Filter
          <ChevronDown className="w-3 h-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
          sideOffset={4}
          align="start"
        >
          {groups.map((group, idx) => (
            <div key={group.id}>
              {idx > 0 && <div className="h-px bg-gray-100 my-1" />}
              <div className="px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                {group.label}
              </div>
              {group.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => group.onChange(option.value)}
                  className={`w-full px-3 py-1.5 text-xs text-left flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                    group.value === option.value ? 'text-gray-900' : 'text-gray-600'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      group.value === option.value
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {group.value === option.value && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface ActiveFilterPillProps {
  label: string;
  onRemove?: (() => void) | null;
}

export function ActiveFilterPill({ label, onRemove }: ActiveFilterPillProps) {
  return (
    <span className="inline-flex items-center gap-1 h-6 pl-2.5 pr-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition-colors">
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

interface TimeRangeDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

export function TimeRangeDropdown({ value, onChange }: TimeRangeDropdownProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 pl-2 pr-7 text-xs bg-white border border-gray-200 rounded-md appearance-none cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors"
      >
        <option value="7d">7 天</option>
        <option value="30d">30 天</option>
        <option value="all">全部</option>
      </select>
      <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
