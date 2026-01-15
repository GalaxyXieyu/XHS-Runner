import type { Dispatch, SetStateAction } from 'react';
import { AlertCircle, CheckCircle2, Loader, RefreshCw, XCircle } from 'lucide-react';
import type { TaskExecution } from '@/features/task-management/types';

interface TaskManagementSectionProps {
  taskStatusTab: 'running' | 'completed' | 'failed';
  setTaskStatusTab: (tab: 'running' | 'completed' | 'failed') => void;
  runningTasks: TaskExecution[];
  completedTasks: TaskExecution[];
  failedTasks: TaskExecution[];
  selectedTasks: string[];
  setSelectedTasks: Dispatch<SetStateAction<string[]>>;
}

export function TaskManagementSection({
  taskStatusTab,
  setTaskStatusTab,
  runningTasks,
  completedTasks,
  failedTasks,
  selectedTasks,
  setSelectedTasks,
}: TaskManagementSectionProps) {
  return (
    <div className="h-full flex flex-col bg-white border border-gray-200 rounded overflow-hidden">
      <div className="border-b border-gray-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setTaskStatusTab('running')}
              className={`px-3 py-1.5 text-xs rounded transition-all ${taskStatusTab === 'running'
                ? 'bg-blue-500 text-white'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
              正在进行 ({runningTasks.length})
            </button>
            <button
              onClick={() => setTaskStatusTab('completed')}
              className={`px-3 py-1.5 text-xs rounded transition-all ${taskStatusTab === 'completed'
                ? 'bg-green-500 text-white'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
              已完成 ({completedTasks.length})
            </button>
            <button
              onClick={() => setTaskStatusTab('failed')}
              className={`px-3 py-1.5 text-xs rounded transition-all ${taskStatusTab === 'failed'
                ? 'bg-red-500 text-white'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
              失败 ({failedTasks.length})
            </button>
          </div>

          <div className="flex gap-2">
            <select className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500">
              <option>全部类型</option>
              <option>立即生成</option>
              <option>定时任务</option>
            </select>
            <select className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500">
              <option>最近7天</option>
              <option>最近30天</option>
              <option>全部时间</option>
            </select>
          </div>
        </div>

        {selectedTasks.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <span className="text-xs text-gray-600">已选 {selectedTasks.length} 条记录</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTasks([])}
                className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">
                批量删除
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {taskStatusTab === 'running' && (
          <div className="space-y-2">
            {runningTasks.length > 0 ? (
              runningTasks.map(task => (
                <div key={task.id} className="group p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-all">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.id)}
                      onChange={() => {
                        setSelectedTasks(prev =>
                          prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                        );
                      }}
                      className="mt-0.5 w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-medium text-gray-900">{task.taskName}</span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {task.taskType === 'instant' ? '立即生成' : '定时任务'}
                        </span>
                        <Loader className="w-3.5 h-3.5 text-blue-600 animate-spin ml-auto" />
                      </div>
                      <div className="text-xs text-gray-500 mb-2">
                        已生成 {task.generatedCount}/{task.targetCount} 个内容包
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>开始时间：{task.startTime}</span>
                        <span className="text-blue-600 font-medium">{task.progress}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader className="w-12 h-12 text-gray-300 mb-3" />
                <div className="text-sm text-gray-900 mb-1">暂无正在进行的任务</div>
                <div className="text-xs text-gray-500">开始生成后会显示在这里</div>
              </div>
            )}
          </div>
        )}

        {taskStatusTab === 'completed' && (
          <div className="space-y-2">
            {completedTasks.length > 0 ? (
              completedTasks.map(task => (
                <div key={task.id} className="group p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.id)}
                      onChange={() => {
                        setSelectedTasks(prev =>
                          prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                        );
                      }}
                      className="mt-0.5 w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-sm font-medium text-gray-900">{task.taskName}</span>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                              {task.taskType === 'instant' ? '立即生成' : '定时任务'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {task.startTime} - {task.endTime} · 生成 {task.generatedCount} 个
                          </div>
                        </div>
                        <button className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          查看结果
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-gray-300 mb-3" />
                <div className="text-sm text-gray-900 mb-1">暂无已完成的任务</div>
                <div className="text-xs text-gray-500">完成的任务会显示在这里</div>
              </div>
            )}
          </div>
        )}

        {taskStatusTab === 'failed' && (
          <div className="space-y-2">
            {failedTasks.length > 0 ? (
              failedTasks.map(task => (
                <div key={task.id} className="group p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-all">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.id)}
                      onChange={() => {
                        setSelectedTasks(prev =>
                          prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                        );
                      }}
                      className="mt-0.5 w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-sm font-medium text-gray-900">{task.taskName}</span>
                          </div>
                          <div className="text-xs text-gray-600 mb-1">
                            {task.startTime} · 生成 {task.generatedCount}/{task.targetCount} 后失败
                          </div>
                          {task.errorMessage && (
                            <div className="flex items-start gap-1 text-xs text-red-600">
                              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              {task.errorMessage}
                            </div>
                          )}
                        </div>
                        <button className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <RefreshCw className="w-3 h-3" />
                          重试
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <XCircle className="w-12 h-12 text-gray-300 mb-3" />
                <div className="text-sm text-gray-900 mb-1">暂无失败的任务</div>
                <div className="text-xs text-gray-500">失败的任务会显示在这里</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
