import { Plus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilterDropdown, ActiveFilterPill, TimeRangeDropdown } from './FilterDropdown';
import type { ThemeSummary } from '../taskCenterTypes';

export type TabType = 'schedule' | 'history';
type JobTypeFilter = 'all' | 'capture' | 'daily_generate';
type StatusFilter = 'all' | 'enabled' | 'paused';
type HistoryStatusFilter = 'all' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'timeout';
type HistoryTypeFilter = 'all' | 'job_execution' | 'generation_task' | 'publish_record';
type TimeRange = '7d' | '30d' | 'all';

interface TaskCenterFiltersProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  // Schedule filters
  jobTypeFilter: JobTypeFilter;
  onJobTypeChange: (type: JobTypeFilter) => void;
  statusFilter: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  themes: ThemeSummary[];
  selectedThemeId: string;
  onThemeChange: (themeId: string) => void;
  onCreateTask: () => void;
  // History filters
  historyStatusFilter: HistoryStatusFilter;
  onHistoryStatusChange: (status: HistoryStatusFilter) => void;
  historyTypeFilter: HistoryTypeFilter;
  onHistoryTypeChange: (type: HistoryTypeFilter) => void;
}

export function TaskCenterFilters({
  activeTab,
  onTabChange,
  timeRange,
  onTimeRangeChange,
  jobTypeFilter,
  onJobTypeChange,
  statusFilter,
  onStatusChange,
  themes,
  selectedThemeId,
  onThemeChange,
  onCreateTask,
  historyStatusFilter,
  onHistoryStatusChange,
  historyTypeFilter,
  onHistoryTypeChange,
}: TaskCenterFiltersProps) {
  // Build filter groups based on active tab
  const filterGroups = activeTab === 'schedule'
    ? [
        {
          id: 'type',
          label: '类型',
          options: [
            { id: 'all', label: '全部', value: 'all' },
            { id: 'capture', label: '抓取', value: 'capture' },
            { id: 'daily_generate', label: '定时生成', value: 'daily_generate' },
          ],
          value: jobTypeFilter,
          onChange: (v: string) => onJobTypeChange(v as JobTypeFilter),
        },
        {
          id: 'status',
          label: '状态',
          options: [
            { id: 'all', label: '全部', value: 'all' },
            { id: 'enabled', label: '启用', value: 'enabled' },
            { id: 'paused', label: '暂停', value: 'paused' },
          ],
          value: statusFilter,
          onChange: (v: string) => onStatusChange(v as StatusFilter),
        },
        {
          id: 'theme',
          label: '主题',
          options: themes.map((t) => ({
            id: String(t.id),
            label: t.name,
            value: String(t.id),
          })),
          value: selectedThemeId,
          onChange: onThemeChange,
        },
      ]
    : [
        {
          id: 'type',
          label: '类型',
          options: [
            { id: 'all', label: '全部', value: 'all' },
            { id: 'job_execution', label: '调度执行', value: 'job_execution' },
            { id: 'generation_task', label: '内容生成', value: 'generation_task' },
            { id: 'publish_record', label: '发布', value: 'publish_record' },
          ],
          value: historyTypeFilter,
          onChange: (v: string) => onHistoryTypeChange(v as HistoryTypeFilter),
        },
        {
          id: 'status',
          label: '状态',
          options: [
            { id: 'all', label: '全部', value: 'all' },
            { id: 'success', label: '成功', value: 'success' },
            { id: 'failed', label: '失败', value: 'failed' },
            { id: 'running', label: '执行中', value: 'running' },
          ],
          value: historyStatusFilter,
          onChange: (v: string) => onHistoryStatusChange(v as HistoryStatusFilter),
        },
      ];

  // Build active pills
  const activePills: Array<{ label: string; onRemove: (() => void) | null }> = [];

  if (activeTab === 'schedule') {
    if (jobTypeFilter !== 'all') {
      activePills.push({
        label: jobTypeFilter === 'capture' ? '抓取' : '定时生成',
        onRemove: () => onJobTypeChange('all'),
      });
    }
    if (statusFilter !== 'all') {
      activePills.push({
        label: statusFilter === 'enabled' ? '启用中' : '已暂停',
        onRemove: () => onStatusChange('all'),
      });
    }
    const themeName = themes.find((t) => String(t.id) === selectedThemeId)?.name;
    if (themeName && themes.length > 1) {
      activePills.push({ label: themeName, onRemove: null });
    }
  } else {
    if (historyTypeFilter !== 'all') {
      const typeLabels: Record<string, string> = {
        job_execution: '调度执行',
        generation_task: '内容生成',
        publish_record: '发布',
      };
      activePills.push({
        label: typeLabels[historyTypeFilter] || historyTypeFilter,
        onRemove: () => onHistoryTypeChange('all'),
      });
    }
    if (historyStatusFilter !== 'all') {
      const labels: Record<string, string> = {
        success: '成功',
        failed: '失败',
        running: '执行中',
        pending: '等待中',
        canceled: '已取消',
        timeout: '超时',
      };
      activePills.push({
        label: labels[historyStatusFilter] || historyStatusFilter,
        onRemove: () => onHistoryStatusChange('all'),
      });
    }
  }

  return (
    <div className="space-y-3">
      {/* Row 1: Tabs + Actions */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabType)}>
          <TabsList className="h-8 bg-gray-100/50 p-0.5 rounded-lg">
            <TabsTrigger
              value="schedule"
              className="text-xs px-4 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              任务调度
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="text-xs px-4 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              执行历史
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {activeTab === 'schedule' && (
            <button
              onClick={onCreateTask}
              disabled={themes.length === 0}
              className="h-7 px-3 text-xs rounded-md font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新建
            </button>
          )}
          <TimeRangeDropdown value={timeRange} onChange={onTimeRangeChange} />
        </div>
      </div>

      {/* Row 2: Filter Button + Active Pills */}
      <div className="flex items-center gap-2 min-h-[28px]">
        <FilterDropdown groups={filterGroups} />
        {activePills.map((pill, idx) => (
          <ActiveFilterPill key={idx} label={pill.label} onRemove={pill.onRemove} />
        ))}
      </div>
    </div>
  );
}
