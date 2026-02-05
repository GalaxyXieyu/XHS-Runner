import { Plus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ThemeSummary } from '../taskCenterTypes';

type TabType = 'capture' | 'generation' | 'executions';
type JobTypeFilter = 'all' | 'capture' | 'daily_generate';
type CaptureStatusFilter = 'all' | 'enabled' | 'paused';
type TaskStatusFilter = 'all' | 'queued' | 'running' | 'completed' | 'failed';
type ExecutionStatusFilter = 'all' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'timeout';
type TimeRange = '7d' | '30d' | 'all';

interface TaskCenterFiltersProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  // Capture filters
  jobTypeFilter: JobTypeFilter;
  onJobTypeChange: (type: JobTypeFilter) => void;
  captureStatusFilter: CaptureStatusFilter;
  onCaptureStatusChange: (status: CaptureStatusFilter) => void;
  themes: ThemeSummary[];
  dailyThemeId: string;
  onDailyThemeChange: (themeId: string) => void;
  onCreateTask: () => void;
  // Generation filters
  taskStatusFilter: TaskStatusFilter;
  onTaskStatusChange: (status: TaskStatusFilter) => void;
  // Execution filters
  executionStatusFilter: ExecutionStatusFilter;
  onExecutionStatusChange: (status: ExecutionStatusFilter) => void;
}

export function TaskCenterFilters({
  activeTab,
  onTabChange,
  timeRange,
  onTimeRangeChange,
  jobTypeFilter,
  onJobTypeChange,
  captureStatusFilter,
  onCaptureStatusChange,
  themes,
  dailyThemeId,
  onDailyThemeChange,
  onCreateTask,
  taskStatusFilter,
  onTaskStatusChange,
  executionStatusFilter,
  onExecutionStatusChange,
}: TaskCenterFiltersProps) {
  return (
    <div className="border-b border-gray-200 pb-3 space-y-3">
      {/* Row 1: Main Tabs + Time Range */}
      <div className="flex items-center justify-between gap-4">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabType)}>
          <TabsList className="h-8">
            <TabsTrigger value="capture" className="text-xs px-3">抓取调度</TabsTrigger>
            <TabsTrigger value="generation" className="text-xs px-3">生成任务</TabsTrigger>
            <TabsTrigger value="executions" className="text-xs px-3">执行历史</TabsTrigger>
          </TabsList>
        </Tabs>

        <ToggleGroup
          type="single"
          value={timeRange}
          onValueChange={(v) => v && onTimeRangeChange(v as TimeRange)}
          variant="outline"
          size="sm"
          className="h-7"
        >
          <ToggleGroupItem value="7d" className="text-xs px-2 h-7">7天</ToggleGroupItem>
          <ToggleGroupItem value="30d" className="text-xs px-2 h-7">30天</ToggleGroupItem>
          <ToggleGroupItem value="all" className="text-xs px-2 h-7">全部</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Row 2: Context-specific filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {activeTab === 'capture' && (
          <>
            <ToggleGroup
              type="single"
              value={jobTypeFilter}
              onValueChange={(v) => v && onJobTypeChange(v as JobTypeFilter)}
              variant="outline"
              size="sm"
              className="h-7"
            >
              <ToggleGroupItem value="all" className="text-xs px-2 h-7">全部</ToggleGroupItem>
              <ToggleGroupItem value="capture" className="text-xs px-2 h-7">抓取</ToggleGroupItem>
              <ToggleGroupItem value="daily_generate" className="text-xs px-2 h-7">定时生成</ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={captureStatusFilter}
              onValueChange={(v) => v && onCaptureStatusChange(v as CaptureStatusFilter)}
              variant="outline"
              size="sm"
              className="h-7"
            >
              <ToggleGroupItem value="all" className="text-xs px-2 h-7">全部</ToggleGroupItem>
              <ToggleGroupItem value="enabled" className="text-xs px-2 h-7">启用</ToggleGroupItem>
              <ToggleGroupItem value="paused" className="text-xs px-2 h-7">暂停</ToggleGroupItem>
            </ToggleGroup>

            {(jobTypeFilter === 'daily_generate' || jobTypeFilter === 'all') && (
              <>
                <select
                  value={dailyThemeId}
                  onChange={(e) => onDailyThemeChange(e.target.value)}
                  className="h-7 px-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  {themes.length === 0 ? (
                    <option value="">暂无主题</option>
                  ) : (
                    themes.map((theme) => (
                      <option key={theme.id} value={String(theme.id)}>{theme.name}</option>
                    ))
                  )}
                </select>

                <button
                  onClick={onCreateTask}
                  disabled={themes.length === 0}
                  className="h-7 px-3 text-xs rounded-md bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新建定时
                </button>
              </>
            )}
          </>
        )}

        {activeTab === 'generation' && (
          <ToggleGroup
            type="single"
            value={taskStatusFilter}
            onValueChange={(v) => v && onTaskStatusChange(v as TaskStatusFilter)}
            variant="outline"
            size="sm"
            className="h-7"
          >
            <ToggleGroupItem value="all" className="text-xs px-2 h-7">全部</ToggleGroupItem>
            <ToggleGroupItem value="queued" className="text-xs px-2 h-7">排队</ToggleGroupItem>
            <ToggleGroupItem value="running" className="text-xs px-2 h-7">生成中</ToggleGroupItem>
            <ToggleGroupItem value="completed" className="text-xs px-2 h-7">完成</ToggleGroupItem>
            <ToggleGroupItem value="failed" className="text-xs px-2 h-7">失败</ToggleGroupItem>
          </ToggleGroup>
        )}

        {activeTab === 'executions' && (
          <ToggleGroup
            type="single"
            value={executionStatusFilter}
            onValueChange={(v) => v && onExecutionStatusChange(v as ExecutionStatusFilter)}
            variant="outline"
            size="sm"
            className="h-7"
          >
            <ToggleGroupItem value="all" className="text-xs px-2 h-7">全部</ToggleGroupItem>
            <ToggleGroupItem value="pending" className="text-xs px-2 h-7">等待</ToggleGroupItem>
            <ToggleGroupItem value="running" className="text-xs px-2 h-7">执行中</ToggleGroupItem>
            <ToggleGroupItem value="success" className="text-xs px-2 h-7">成功</ToggleGroupItem>
            <ToggleGroupItem value="failed" className="text-xs px-2 h-7">失败</ToggleGroupItem>
            <ToggleGroupItem value="canceled" className="text-xs px-2 h-7">取消</ToggleGroupItem>
            <ToggleGroupItem value="timeout" className="text-xs px-2 h-7">超时</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
    </div>
  );
}
