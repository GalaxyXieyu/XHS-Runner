import { X } from 'lucide-react';
import type { AutoTask } from '@/features/task-management/types';
import type { Theme } from '@/App';

interface TaskFormModalProps {
  theme: Theme;
  editingTask: AutoTask | null;
  showTaskForm: boolean;
  taskSaving: boolean;
  taskSaveError: string;
  promptProfiles: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}

export function TaskFormModal({
  theme,
  editingTask,
  showTaskForm,
  taskSaving,
  taskSaveError,
  promptProfiles,
  onClose,
  onSave,
}: TaskFormModalProps) {
  if (!showTaskForm) return null;

  const readValue = (id: string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    return el ? String((el as any).value ?? '').trim() : '';
  };

  const parseScheduleText = (raw: string):
    | { schedule_type: 'cron'; cron_expression: string }
    | { schedule_type: 'interval'; interval_minutes: number }
    | null => {
    const text = (raw || '').trim();
    if (!text) return null;

    const mDaily = text.match(/^每日\s*(\d{1,2})\s*:\s*(\d{2})$/);
    if (mDaily) {
      const hh = Number(mDaily[1]);
      const mm = Number(mDaily[2]);
      if (Number.isFinite(hh) && Number.isFinite(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return { schedule_type: 'cron', cron_expression: `${mm} ${hh} * * *` };
      }
      return null;
    }

    const mapDow = (token: string) => {
      const t = token.trim();
      if (/^[1-7]$/.test(t)) return Number(t) % 7;
      const zh = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 } as const;
      const v = (zh as any)[t];
      return typeof v === 'number' ? v : null;
    };

    const mWeekly = text.match(/^每周\s*([1-7一二三四五六日天])\s*(\d{1,2})\s*:\s*(\d{2})$/);
    if (mWeekly) {
      const dow = mapDow(mWeekly[1]);
      const hh = Number(mWeekly[2]);
      const mm = Number(mWeekly[3]);
      if (
        dow !== null &&
        Number.isFinite(hh) &&
        Number.isFinite(mm) &&
        hh >= 0 &&
        hh <= 23 &&
        mm >= 0 &&
        mm <= 59
      ) {
        return { schedule_type: 'cron', cron_expression: `${mm} ${hh} * * ${dow}` };
      }
      return null;
    }

    const mInterval = text.match(/^(\d{1,4})\s*(分钟|min|m)?$/i);
    if (mInterval) {
      const minutes = Number(mInterval[1]);
      if (Number.isFinite(minutes) && minutes > 0 && minutes <= 24 * 60) {
        return { schedule_type: 'interval', interval_minutes: minutes };
      }
    }

    return null;
  };

  const handleSave = async () => {
    const name = readValue('task-name');

    // 构建 schedule 文本
    const scheduleType = readValue('task-schedule-type');
    const scheduleTime = readValue('task-schedule-time');
    let scheduleText = '';

    if (scheduleType === 'daily') {
      scheduleText = `每日 ${scheduleTime}`;
    } else if (scheduleType === 'weekly') {
      const dayCheckboxes = Array.from(document.querySelectorAll('[data-schedule-day]:checked')) as HTMLInputElement[];
      if (dayCheckboxes.length === 0) {
        throw new Error('每周执行需至少选择一天');
      }
      const firstDay = dayCheckboxes[0].value;
      const dayMap: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '0': '日' };
      scheduleText = `每周${dayMap[firstDay]} ${scheduleTime}`;
    }

    const goal = readValue('task-goal') || 'collects';
    const outputCountRaw = readValue('task-output-count');
    const persona = readValue('task-persona');
    const tone = readValue('task-tone');
    const promptProfileId = readValue('task-prompt-profile') || '1';
    const imageModel = readValue('task-image-model') || 'nanobanana';
    const minQualityRaw = readValue('task-min-quality');

    if (!name) {
      throw new Error('请填写任务名称');
    }

    const scheduleParsed = parseScheduleText(scheduleText);
    if (!scheduleParsed) {
      throw new Error('执行计划格式不正确：例如"每日 09:00"或"每周一 09:00"（也支持直接填 30 表示每 30 分钟）');
    }

    const outputCount = Number(outputCountRaw || 5);
    if (!Number.isFinite(outputCount) || outputCount < 1 || outputCount > 20) {
      throw new Error('生成数量需为 1-20');
    }

    const minQualityScore = Number(minQualityRaw || 70);
    if (!Number.isFinite(minQualityScore) || minQualityScore < 0 || minQualityScore > 100) {
      throw new Error('最低质量分需为 0-100');
    }

    const isEnabled = editingTask ? editingTask.status === 'active' : true;

    const payload: any = {
      name,
      job_type: 'daily_generate',
      theme_id: Number(theme.id),
      schedule_type: scheduleParsed.schedule_type,
      interval_minutes: scheduleParsed.schedule_type === 'interval' ? scheduleParsed.interval_minutes : null,
      cron_expression: scheduleParsed.schedule_type === 'cron' ? scheduleParsed.cron_expression : null,
      params: {
        goal,
        output_count: outputCount,
        persona,
        tone,
        prompt_profile_id: promptProfileId,
        image_model: imageModel,
        min_quality_score: minQualityScore,
      },
      is_enabled: isEnabled,
      priority: 5,
    };

    await onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-900">
            {editingTask ? '编辑定时任务' : '新建定时任务'}
          </h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {taskSaveError ? (
            <div className="p-3 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg">
              {taskSaveError}
            </div>
          ) : null}

          <div>
            <label htmlFor="task-name" className="block text-sm font-medium text-gray-700 mb-2">
              任务名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="task-name"
              type="text"
              defaultValue={editingTask?.name || ''}
              placeholder="例如：防晒主题每日内容"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              执行计划 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              <div>
                <label htmlFor="task-schedule-type" className="block text-xs text-gray-600 mb-1">频率类型</label>
                <select
                  id="task-schedule-type"
                  defaultValue={editingTask?.schedule?.startsWith('每日') ? 'daily' : editingTask?.schedule?.startsWith('每周') ? 'weekly' : 'daily'}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  onChange={(e) => {
                    const weeklyRow = document.getElementById('task-schedule-weekly-row');
                    if (weeklyRow) {
                      weeklyRow.style.display = e.target.value === 'weekly' ? 'block' : 'none';
                    }
                  }}
                >
                  <option value="daily">每日</option>
                  <option value="weekly">每周</option>
                </select>
              </div>
              <div id="task-schedule-weekly-row" style={{ display: editingTask?.schedule?.startsWith('每周') ? 'block' : 'none' }}>
                <label className="block text-xs text-gray-600 mb-1">星期</label>
                <div className="flex gap-2">
                  {[
                    { label: '一', value: '1' },
                    { label: '二', value: '2' },
                    { label: '三', value: '3' },
                    { label: '四', value: '4' },
                    { label: '五', value: '5' },
                    { label: '六', value: '6' },
                    { label: '日', value: '0' },
                  ].map((day) => (
                    <label key={day.value} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        value={day.value}
                        data-schedule-day
                        defaultChecked={
                          editingTask?.schedule?.includes(`每周${day.label}`) ||
                          (day.label === '一' && editingTask?.schedule?.startsWith('每周') && !editingTask?.schedule?.match(/每周[二三四五六日]/))
                        }
                        className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="task-schedule-time" className="block text-xs text-gray-600 mb-1">执行时间</label>
                <input
                  id="task-schedule-time"
                  type="time"
                  defaultValue={(() => {
                    const match = editingTask?.schedule?.match(/(\d{1,2}):(\d{2})/);
                    if (match) {
                      const hh = match[1].padStart(2, '0');
                      const mm = match[2];
                      return `${hh}:${mm}`;
                    }
                    return '09:00';
                  })()}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="task-goal" className="block text-sm font-medium text-gray-700 mb-2">内容目标</label>
              <select
                id="task-goal"
                defaultValue={editingTask?.config.goal || 'collects'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="collects">收藏优先</option>
                <option value="comments">评论优先</option>
                <option value="followers">涨粉优先</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-output-count" className="block text-sm font-medium text-gray-700 mb-2">生成数量</label>
              <input
                id="task-output-count"
                type="number"
                defaultValue={editingTask?.config.outputCount || 5}
                min={1}
                max={20}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="task-persona" className="block text-sm font-medium text-gray-700 mb-2">目标受众</label>
            <input
              id="task-persona"
              type="text"
              defaultValue={editingTask?.config.persona || ''}
              placeholder="例如：学生党、职场女性"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label htmlFor="task-tone" className="block text-sm font-medium text-gray-700 mb-2">内容语气</label>
            <input
              id="task-tone"
              type="text"
              defaultValue={editingTask?.config.tone || ''}
              placeholder="例如：干货/亲和"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="task-prompt-profile" className="block text-sm font-medium text-gray-700 mb-2">提示词模板</label>
              <select
                id="task-prompt-profile"
                defaultValue={editingTask?.config.promptProfileId || '1'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {promptProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="task-image-model" className="block text-sm font-medium text-gray-700 mb-2">图像模型</label>
              <select
                id="task-image-model"
                defaultValue={editingTask?.config.imageModel || 'nanobanana'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="nanobanana">Nanobanana</option>
                <option value="jimeng">即梦</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="task-min-quality" className="block text-sm font-medium text-gray-700 mb-2">最低质量分</label>
            <input
              id="task-min-quality"
              type="number"
              defaultValue={editingTask?.config.minQualityScore || 70}
              min={0}
              max={100}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
          >
            取消
          </button>
          <button
            onClick={async () => {
              try {
                await handleSave();
              } catch (err: any) {
                // Error handled by parent
              }
            }}
            disabled={taskSaving}
            className={`px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 ${taskSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {taskSaving ? '保存中...' : (editingTask ? '保存修改' : '创建任务')}
          </button>
        </div>
      </div>
    </div>
  );
}
