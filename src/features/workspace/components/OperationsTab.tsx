import { useState } from 'react';
import { Send, MessageSquare, Trash2, Eye, Heart, TrendingUp, Clock, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import type { Theme } from '@/App';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePublishQueue } from '../hooks/usePublishQueue';
import { useComments } from '../hooks/useComments';
import { useMetrics } from '../hooks/useMetrics';
import { formatTime } from '@/features/task-center/taskCenterUtils';

interface OperationsTabProps {
  theme: Theme;
  onRequireXhsLogin?: () => void;
}

export function OperationsTab({ theme, onRequireXhsLogin }: OperationsTabProps) {
  // 使用真实数据 hooks
  const { queue: publishQueue, loading: queueLoading, publishNow, deleteTask, refresh: refreshQueue } = usePublishQueue({ themeId: theme.id, onRequireXhsLogin });
  const { comments, loading: commentsLoading, generateAIReply, sendReply, refresh: refreshComments, syncComments } = useComments();
  const { summary, trend, publishedNotes, loading: metricsLoading, refresh: refreshMetrics, syncMetrics } = useMetrics({ themeId: theme.id });

  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [loadingStates, setLoadingStates] = useState<{ [key: string]: boolean }>({});

  const handlePublish = async (taskId: string) => {
    setLoadingStates((s) => ({ ...s, [`publish_${taskId}`]: true }));
    await publishNow(taskId);
    setLoadingStates((s) => ({ ...s, [`publish_${taskId}`]: false }));
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;
    await deleteTask(taskId);
  };

  const handleReply = async (commentId: string) => {
    const reply = replyText[commentId];
    if (!reply?.trim()) return;

    setLoadingStates((s) => ({ ...s, [`reply_${commentId}`]: true }));
    const success = await sendReply(commentId, reply.trim());
    if (success) {
      setReplyText({ ...replyText, [commentId]: '' });
    }
    setLoadingStates((s) => ({ ...s, [`reply_${commentId}`]: false }));
  };

  const handleGenerateAIReply = async (commentId: string) => {
    setLoadingStates((s) => ({ ...s, [`ai_${commentId}`]: true }));
    const reply = await generateAIReply(commentId);
    if (reply) {
      setReplyText({ ...replyText, [commentId]: reply });
    }
    setLoadingStates((s) => ({ ...s, [`ai_${commentId}`]: false }));
  };

  const handleDeleteNote = (noteId: string) => {
    if (confirm('确定要删除这篇笔记吗？')) {
      // TODO: 实际删除 API
      console.log('Delete note:', noteId);
    }
  };

  const unreadComments = comments.filter((c) => !c.replied).length;
  const lowPerformanceNotes = publishedNotes.filter((n) => n.shouldDelete).length;
  const isLoading = queueLoading || commentsLoading || metricsLoading;

  // 图表数据（使用真实趋势数据或空数组）
  const chartData = trend.length > 0 ? trend : [];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-blue-600 font-medium">待发布</span>
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
              <Clock className="w-3 h-3 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{summary?.queued || publishQueue.length}</div>
          <div className="text-xs text-gray-500">计划中</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-emerald-600 font-medium">已发布</span>
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <Send className="w-3 h-3 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{summary?.published || publishedNotes.length}</div>
          <div className="text-xs text-gray-500">本月累计</div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-100 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-amber-600 font-medium">待回复</span>
            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
              <MessageSquare className="w-3 h-3 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{summary?.pendingReplies || unreadComments}</div>
          <div className="text-xs text-gray-500">未读评论</div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-white border border-red-100 rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-red-600 font-medium">低质提醒</span>
            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-3 h-3 text-red-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-600">{lowPerformanceNotes}</div>
          <div className="text-xs text-gray-500">需处理</div>
        </div>
      </div>

      {/* Publish Queue */}
      <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
              <Clock className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-900">发布队列</span>
          </div>
          <button onClick={refreshQueue} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="刷新">
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${queueLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="space-y-2">
          {publishQueue.map((task) => (
            <div key={task.id} className="flex gap-2 p-2 bg-gray-50 rounded">
              {task.thumbnail ? (
                <img src={task.thumbnail} alt={task.title} className="w-16 h-16 object-cover rounded flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 mb-0.5 line-clamp-1">{task.title}</div>
                <div className="text-xs text-gray-500 mb-1.5">
                  <Clock className="w-3 h-3 inline mr-0.5" />
                  {task.scheduledTime ? formatTime(task.scheduledTime) : '-'}
                </div>
                <div className="flex items-center gap-1.5">
                  {(task.status === 'pending' || task.status === 'queued') && (
                    <>
                      <button
                        onClick={() => handlePublish(task.id)}
                        disabled={loadingStates[`publish_${task.id}`]}
                        className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {loadingStates[`publish_${task.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : '立即发布'}
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-gray-500" />
                      </button>
                    </>
                  )}
                  {task.status === 'running' && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> 发布中...
                    </span>
                  )}
                  {task.status === 'failed' && (
                    <span className="text-xs text-red-600">发布失败: {task.errorMessage || '未知错误'}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {publishQueue.length === 0 && !queueLoading && (
            <div className="text-center py-8 text-sm text-gray-400">暂无待发布任务</div>
          )}
          {queueLoading && publishQueue.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-300" />
              加载中...
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
              <MessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-900">互动管理</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => syncComments()} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="同步评论">
              <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${commentsLoading ? 'animate-spin' : ''}`} />
            </button>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={autoReplyEnabled}
                onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                className="w-3.5 h-3.5 text-red-500 rounded border-gray-300 focus:ring-red-500"
              />
              <span className="text-gray-600">自动回复</span>
            </label>
          </div>
        </div>
        <div className="space-y-1.5">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className={`p-2 rounded border ${comment.replied ? 'bg-gray-50 border-gray-200' : 'bg-yellow-50 border-yellow-200'}`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900">{comment.author}</div>
                  <div className="text-xs text-gray-500">{comment.noteTitle}</div>
                </div>
                <div className="flex items-center gap-1">
                  {comment.replied ? (
                    <span className="text-xs text-green-600">已回复</span>
                  ) : (
                    <span className="text-xs text-orange-600">待回复</span>
                  )}
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">{comment.time}</span>
                </div>
              </div>
              <p className="text-xs text-gray-700 mb-1.5">{comment.content}</p>
              {!comment.replied && (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={replyText[comment.id] || ''}
                    onChange={(e) => setReplyText({ ...replyText, [comment.id]: e.target.value })}
                    placeholder="输入回复..."
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    onClick={() => handleGenerateAIReply(comment.id)}
                    disabled={loadingStates[`ai_${comment.id}`]}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {loadingStates[`ai_${comment.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : 'AI'}
                  </button>
                  <button
                    onClick={() => handleReply(comment.id)}
                    disabled={loadingStates[`reply_${comment.id}`] || !replyText[comment.id]?.trim()}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {loadingStates[`reply_${comment.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : '发送'}
                  </button>
                </div>
              )}
            </div>
          ))}
          {comments.length === 0 && !commentsLoading && (
            <div className="text-center py-8 text-sm text-gray-400">暂无评论</div>
          )}
        </div>
      </div>

      {/* Performance */}
      <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-900">数据趋势</span>
          </div>
          <button onClick={() => syncMetrics()} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="同步指标">
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${metricsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="h-44 mb-4 bg-white rounded-lg p-2 border border-gray-100">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" style={{ fontSize: '10px' }} />
                <YAxis style={{ fontSize: '10px' }} />
                <Tooltip />
                <Line type="monotone" dataKey="views" stroke="#EF4444" strokeWidth={1.5} name="浏览" />
                <Line type="monotone" dataKey="likes" stroke="#10B981" strokeWidth={1.5} name="点赞" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">暂无趋势数据</div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-700 mb-2">已发布笔记</div>
          {publishedNotes.map((note) => (
            <div key={note.id} className={`p-3 rounded-lg transition-all ${note.shouldDelete ? 'bg-gradient-to-r from-red-50 to-white border border-red-200' : 'bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm'}`}>
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{note.title}</span>
                    {note.shouldDelete && <span className="text-xs text-red-600 flex-shrink-0">⚠️</span>}
                  </div>
                  <div className="text-xs text-gray-500">{note.publishTime ? formatTime(note.publishTime) : '-'}</div>
                </div>
                <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                  {note.views >= 1000 ? `${(note.views / 1000).toFixed(1)}k` : note.views}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-red-400" />
                  {note.likes}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                  {note.comments}
                </span>
                <span
                  className={`flex items-center gap-1 ml-auto px-2 py-0.5 rounded-full text-xs ${
                    note.trend === 'up' ? 'bg-green-50 text-green-600' : note.trend === 'down' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
                  }`}
                >
                  <TrendingUp className="w-3 h-3" />
                  {note.trend === 'up' ? '上升' : note.trend === 'down' ? '下降' : '稳定'}
                </span>
              </div>
              {note.shouldDelete && (
                <div className="mt-1.5 pt-1.5 border-t border-red-200">
                  <p className="text-xs text-red-700">数据低于阈值，建议删除以维护账号质量</p>
                </div>
              )}
            </div>
          ))}
          {publishedNotes.length === 0 && !metricsLoading && (
            <div className="text-center py-8 text-sm text-gray-400">暂无已发布笔记</div>
          )}
        </div>
      </div>
    </div>
  );
}
