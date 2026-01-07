import { useState } from 'react';

export default function CreativeTab({ theme }) {
  const [assistId, setAssistId] = useState(null);
  const [formState, setFormState] = useState({ title: '', content: '', tags: '' });
  const [status, setStatus] = useState('');

  async function handleGenerate() {
    if (typeof window === 'undefined' || !window.formAssist) {
      setStatus('IPC not available');
      return;
    }
    try {
      const result = await window.formAssist.generate({
        themeId: theme?.id,
        titleHint: theme?.name,
        tags: theme?.keywords || [],
      });
      setAssistId(result.id);
      setFormState({
        title: result.suggestion?.title || '',
        content: result.suggestion?.content || '',
        tags: Array.isArray(result.suggestion?.tags) ? result.suggestion.tags.join(', ') : '',
      });
      setStatus('已生成建议');
    } catch (error) {
      setStatus(`生成失败: ${error.message || error}`);
    }
  }

  async function handleApply() {
    if (typeof window === 'undefined' || !window.formAssist || !assistId) {
      setStatus('请先生成建议');
      return;
    }
    try {
      await window.formAssist.apply({
        id: assistId,
        applied: {
          title: formState.title,
          content: formState.content,
          tags: formState.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        },
      });
      setStatus('已应用建议');
    } catch (error) {
      setStatus(`应用失败: ${error.message || error}`);
    }
  }

  async function handleFeedback() {
    if (typeof window === 'undefined' || !window.formAssist || !assistId) {
      setStatus('请先生成建议');
      return;
    }
    try {
      await window.formAssist.feedback({
        id: assistId,
        feedback: {
          note: '用户已调整并确认',
        },
      });
      setStatus('反馈已保存');
    } catch (error) {
      setStatus(`反馈失败: ${error.message || error}`);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">创作实验室</h2>
      <p className="text-xs text-gray-500 mb-4">
        当前主题：{theme?.name || '未选择'}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">输入配置</h3>
          <div className="text-xs text-gray-500 mb-3">占位：选择参考笔记、配置模型参数。</div>
          <div className="space-y-2">
            <input
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              placeholder="建议标题"
              value={formState.title}
              onChange={(event) => setFormState({ ...formState, title: event.target.value })}
            />
            <textarea
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              rows={4}
              placeholder="建议正文"
              value={formState.content}
              onChange={(event) => setFormState({ ...formState, content: event.target.value })}
            />
            <input
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              placeholder="标签（逗号分隔）"
              value={formState.tags}
              onChange={(event) => setFormState({ ...formState, tags: event.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600"
              >
                生成建议
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
              >
                应用建议
              </button>
              <button
                type="button"
                onClick={handleFeedback}
                className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
              >
                保存反馈
              </button>
            </div>
            <div className="text-[11px] text-gray-400">{status}</div>
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-medium text-gray-700 mb-2">生成结果</h3>
          <div className="text-xs text-gray-500">占位：文案与素材预览区域。</div>
        </div>
      </div>
    </div>
  );
}
