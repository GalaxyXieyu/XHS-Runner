import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type { Theme } from '../App';
import type { ThemeFormData } from './themeManagementUtils';

// AI 填充按钮组件
function AIFillButton({
  themeName,
  onFill,
  disabled,
}: {
  themeName: string;
  onFill: (data: Partial<ThemeFormData>) => void;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClick = async () => {
    if (!themeName.trim()) {
      alert('请先输入主题名称');
      return;
    }
    setLoading(true);
    setSuccess(false);
    try {
      const res = await fetch('/api/themes/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI 填充失败');
      }
      const data = await res.json();
      onFill(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'AI 填充失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={`
        relative overflow-hidden px-3 py-1.5 text-xs font-medium rounded-lg
        transition-all duration-300 ease-out
        ${loading
          ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white cursor-wait'
          : success
            ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white'
            : 'bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 hover:shadow-lg hover:shadow-purple-500/25'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {/* 流光动画背景 */}
      {loading && (
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
      )}

      {/* 粒子效果 */}
      {success && (
        <>
          <span className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full animate-particle-1" />
          <span className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full animate-particle-2" />
          <span className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full animate-particle-3" />
        </>
      )}

      <span className="relative flex items-center gap-1.5">
        {loading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>AI 思考中...</span>
          </>
        ) : success ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>已填充</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>AI 智能填充</span>
          </>
        )}
      </span>
    </button>
  );
}

interface ThemeFormModalProps {
  open: boolean;
  editingTheme: Theme | null;
  formData: ThemeFormData;
  setFormData: Dispatch<SetStateAction<ThemeFormData>>;
  promptProfiles: any[];
  buildCronExpression: () => string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ThemeFormModal({
  open,
  editingTheme,
  formData,
  setFormData,
  promptProfiles,
  buildCronExpression,
  onClose,
  onSubmit,
}: ThemeFormModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg p-4 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="text-sm font-medium text-gray-900 mb-3">
          {editingTheme ? '编辑主题' : '创建新主题'}
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-700">主题名称 *</label>
              <AIFillButton
                themeName={formData.name}
                onFill={(data) => setFormData((prev) => ({ ...prev, ...data }))}
              />
            </div>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：2024夏季防晒攻略"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-700 mb-1">主题描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="简要描述这个主题..."
              rows={2}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-700 mb-1">关键词</label>
            <input
              type="text"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              placeholder="用逗号分隔，例如：防晒, 夏季护肤"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-700 mb-1">竞品账号</label>
            <input
              type="text"
              value={formData.competitors}
              onChange={(e) => setFormData({ ...formData, competitors: e.target.value })}
              placeholder="用逗号分隔，例如：美妆博主A, 护肤达人B"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-700 mb-1">状态</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as Theme['status'] })}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="active">运营中</option>
              <option value="paused">已暂停</option>
              <option value="completed">已完成</option>
            </select>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs font-medium text-gray-800 mb-2">内容生成配置</div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-700 mb-1">目标</label>
                <input
                  type="text"
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  placeholder="收藏优先 / 评论优先 / 涨粉优先"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">受众画像</label>
                <input
                  type="text"
                  value={formData.persona}
                  onChange={(e) => setFormData({ ...formData, persona: e.target.value })}
                  placeholder="例如：25-35岁职场女性"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">语气</label>
                <input
                  type="text"
                  value={formData.tone}
                  onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                  placeholder="干货 / 亲和 / 专业"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">内容结构偏好</label>
                <input
                  type="text"
                  value={formData.contentTypes}
                  onChange={(e) => setFormData({ ...formData, contentTypes: e.target.value })}
                  placeholder="用逗号分隔，例如：清单, 教程, 对比"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">禁用标签</label>
                <input
                  type="text"
                  value={formData.forbiddenTags}
                  onChange={(e) => setFormData({ ...formData, forbiddenTags: e.target.value })}
                  placeholder="用逗号分隔，例如：医疗, 博彩"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">默认模板</label>
                <select
                  value={formData.promptProfileId}
                  onChange={(e) => setFormData({ ...formData, promptProfileId: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="">未选择</option>
                  {promptProfiles.map((profile) => (
                    <option key={profile.id} value={String(profile.id)}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">每日产出数</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.dailyOutputCount}
                    onChange={(e) => setFormData({ ...formData, dailyOutputCount: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">质量阈值</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.minQualityScore}
                    onChange={(e) => setFormData({ ...formData, minQualityScore: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-800">定时抓取配置</div>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, scheduleEnabled: !prev.scheduleEnabled }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  formData.scheduleEnabled ? 'bg-red-500' : 'bg-gray-300'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  formData.scheduleEnabled ? 'left-5' : 'left-0.5'
                }`} />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-700 mb-1">快捷设置</label>
                <select
                  value={formData.schedulePreset}
                  onChange={(e) => {
                    const preset = e.target.value as 'interval' | 'daily' | 'weekly' | 'cron';
                    setFormData((prev) => ({
                      ...prev,
                      schedulePreset: preset,
                      scheduleType: preset === 'interval' ? 'interval' : 'cron',
                    }));
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="interval">固定间隔</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="cron">自定义 Cron</option>
                </select>
              </div>

              {formData.schedulePreset === 'interval' && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-700">执行间隔</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.intervalMinutes}
                    onChange={(e) => setFormData({ ...formData, intervalMinutes: e.target.value })}
                    className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <span className="text-xs text-gray-500">分钟</span>
                </div>
              )}

              {(formData.schedulePreset === 'daily' || formData.schedulePreset === 'weekly') && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-gray-700">执行时间</label>
                  <input
                    type="time"
                    value={formData.scheduleTime}
                    onChange={(e) => setFormData({ ...formData, scheduleTime: e.target.value })}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  {formData.schedulePreset === 'weekly' && (
                    <>
                      <label className="text-xs text-gray-700">执行日</label>
                      <select
                        value={formData.scheduleWeekday}
                        onChange={(e) => setFormData({ ...formData, scheduleWeekday: e.target.value })}
                        className="px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                        <option value="1">周一</option>
                        <option value="2">周二</option>
                        <option value="3">周三</option>
                        <option value="4">周四</option>
                        <option value="5">周五</option>
                        <option value="6">周六</option>
                        <option value="0">周日</option>
                      </select>
                    </>
                  )}
                </div>
              )}

              {formData.schedulePreset === 'cron' && (
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Cron 表达式</label>
                  <input
                    type="text"
                    value={formData.cronExpression}
                    onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                    placeholder="*/30 * * * *"
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">格式: 分 时 日 月 周</p>
                </div>
              )}

              {formData.schedulePreset !== 'interval' && (
                <div className="text-[10px] text-gray-400">
                  当前表达式：{buildCronExpression()}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">抓取数量</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.captureLimit}
                    onChange={(e) => setFormData({ ...formData, captureLimit: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">优先级</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.schedulePriority}
                    onChange={(e) => setFormData({ ...formData, schedulePriority: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-400">启用后保存会自动启动调度器</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              {editingTheme ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
