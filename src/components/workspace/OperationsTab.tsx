import { useState } from 'react';
import { Send, MessageSquare, Trash2, Eye, Heart, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import type { Theme } from '../../App';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface OperationsTabProps {
  theme: Theme;
}

interface PublishTask {
  id: string;
  title: string;
  thumbnail: string;
  scheduledTime: string;
  status: 'pending' | 'published' | 'failed';
}

interface Comment {
  id: string;
  noteTitle: string;
  author: string;
  content: string;
  time: string;
  replied: boolean;
}

interface PublishedNote {
  id: string;
  title: string;
  publishTime: string;
  views: number;
  likes: number;
  comments: number;
  trend: 'up' | 'down' | 'stable';
  shouldDelete: boolean;
}

const mockPublishQueue: PublishTask[] = [
  {
    id: '1',
    title: '千万别买这些防晒霜！2024踩雷避坑指南',
    thumbnail: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400',
    scheduledTime: '2024-01-08 10:00',
    status: 'pending'
  },
  {
    id: '2',
    title: '学生党必看！50元以下平价防晒推荐',
    thumbnail: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400',
    scheduledTime: '2024-01-09 14:00',
    status: 'pending'
  }
];

const mockComments: Comment[] = [
  {
    id: '1',
    noteTitle: '夏季防晒霜大测评',
    author: '小红薯123',
    content: '请问敏感肌适合哪一款呀？',
    time: '5分钟前',
    replied: false
  },
  {
    id: '2',
    noteTitle: '夏季防晒霜大测评',
    author: '护肤爱好者',
    content: '这个测评太实用了！已收藏',
    time: '15分钟前',
    replied: false
  },
  {
    id: '3',
    noteTitle: '防晒霜避雷指南',
    author: '美妆小白',
    content: '能出一期适合油皮的防晒推荐吗？',
    time: '1小时前',
    replied: true
  }
];

const mockPublishedNotes: PublishedNote[] = [
  {
    id: '1',
    title: '夏季防晒霜大测评！这3款真的绝了',
    publishTime: '2024-01-05 10:00',
    views: 15600,
    likes: 1234,
    comments: 456,
    trend: 'up',
    shouldDelete: false
  },
  {
    id: '2',
    title: '千万别买！防晒霜踩雷合集',
    publishTime: '2024-01-04 14:00',
    views: 23400,
    likes: 2100,
    comments: 789,
    trend: 'up',
    shouldDelete: false
  },
  {
    id: '3',
    title: '防晒小贴士分享',
    publishTime: '2024-01-03 09:00',
    views: 87,
    likes: 12,
    comments: 3,
    trend: 'down',
    shouldDelete: true
  }
];

const mockPerformanceData = [
  { date: '01/01', views: 1200, likes: 89 },
  { date: '01/02', views: 1850, likes: 134 },
  { date: '01/03', views: 2400, likes: 198 },
  { date: '01/04', views: 3200, likes: 287 },
  { date: '01/05', views: 4100, likes: 356 },
  { date: '01/06', views: 3800, likes: 321 },
  { date: '01/07', views: 5200, likes: 445 }
];

export function OperationsTab({ theme }: OperationsTabProps) {
  const [publishQueue, setPublishQueue] = useState<PublishTask[]>(mockPublishQueue);
  const [comments, setComments] = useState<Comment[]>(mockComments);
  const [publishedNotes, setPublishedNotes] = useState<PublishedNote[]>(mockPublishedNotes);
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);

  const handlePublish = (taskId: string) => {
    setPublishQueue(publishQueue.map(task =>
      task.id === taskId ? { ...task, status: 'published' as const } : task
    ));
  };

  const handleDeleteTask = (taskId: string) => {
    setPublishQueue(publishQueue.filter(task => task.id !== taskId));
  };

  const handleReply = (commentId: string) => {
    const reply = replyText[commentId];
    if (reply && reply.trim()) {
      setComments(comments.map(comment =>
        comment.id === commentId ? { ...comment, replied: true } : comment
      ));
      setReplyText({ ...replyText, [commentId]: '' });
    }
  };

  const handleDeleteNote = (noteId: string) => {
    if (confirm('确定要删除这篇笔记吗？')) {
      setPublishedNotes(publishedNotes.filter(note => note.id !== noteId));
    }
  };

  const generateAIReply = (commentId: string) => {
    const aiReplies = [
      '感谢您的提问！这款产品确实很适合您的需求~',
      '好问题！我会在下期内容中详细解答，记得关注哦~',
      '谢谢支持！如果还有其他问题欢迎随时交流~'
    ];
    const randomReply = aiReplies[Math.floor(Math.random() * aiReplies.length)];
    setReplyText({ ...replyText, [commentId]: randomReply });
  };

  const unreadComments = comments.filter(c => !c.replied).length;
  const lowPerformanceNotes = publishedNotes.filter(n => n.shouldDelete).length;

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">待发布</span>
            <Clock className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">{publishQueue.length}</div>
          <div className="text-xs text-gray-500">计划中</div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">已发布</span>
            <Send className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">{publishedNotes.length}</div>
          <div className="text-xs text-gray-500">本月累计</div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">待回复</span>
            <MessageSquare className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">{unreadComments}</div>
          <div className="text-xs text-gray-500">未读评论</div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">低质提醒</span>
            <AlertCircle className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-red-600">{lowPerformanceNotes}</div>
          <div className="text-xs text-gray-500">需处理</div>
        </div>
      </div>

      {/* Publish Queue */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-gray-700" />
          <span className="text-xs font-medium text-gray-900">发布队列</span>
        </div>
        <div className="space-y-2">
          {publishQueue.map((task) => (
            <div key={task.id} className="flex gap-2 p-2 bg-gray-50 rounded">
              <img src={task.thumbnail} alt={task.title} className="w-16 h-16 object-cover rounded flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 mb-0.5 line-clamp-1">{task.title}</div>
                <div className="text-xs text-gray-500 mb-1.5">
                  <Clock className="w-3 h-3 inline mr-0.5" />
                  {task.scheduledTime}
                </div>
                <div className="flex items-center gap-1.5">
                  {task.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handlePublish(task.id)}
                        className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      >
                        立即发布
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-gray-500" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {publishQueue.length === 0 && (
            <div className="text-center py-6 text-xs text-gray-500">暂无待发布任务</div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-gray-700" />
            <span className="text-xs font-medium text-gray-900">互动管理</span>
          </div>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={autoReplyEnabled}
              onChange={(e) => setAutoReplyEnabled(e.target.checked)}
              className="w-3 h-3 text-red-500 rounded"
            />
            <span className="text-gray-600">自动回复</span>
          </label>
        </div>
        <div className="space-y-1.5">
          {comments.map((comment) => (
            <div key={comment.id} className={`p-2 rounded border ${
              comment.replied ? 'bg-gray-50 border-gray-200' : 'bg-yellow-50 border-yellow-200'
            }`}>
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
                    onClick={() => generateAIReply(comment.id)}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    AI
                  </button>
                  <button
                    onClick={() => handleReply(comment.id)}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >
                    发送
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Performance */}
      <div className="bg-white border border-gray-200 rounded p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-gray-700" />
          <span className="text-xs font-medium text-gray-900">数据趋势</span>
        </div>
        <div className="h-40 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockPerformanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" style={{ fontSize: '10px' }} />
              <YAxis style={{ fontSize: '10px' }} />
              <Tooltip />
              <Line type="monotone" dataKey="views" stroke="#EF4444" strokeWidth={1.5} name="浏览" />
              <Line type="monotone" dataKey="likes" stroke="#10B981" strokeWidth={1.5} name="点赞" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-gray-900 mb-1">已发布笔记</div>
          {publishedNotes.map((note) => (
            <div
              key={note.id}
              className={`p-2 rounded ${note.shouldDelete ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs font-medium text-gray-900 truncate">{note.title}</span>
                    {note.shouldDelete && (
                      <span className="text-xs text-red-600 flex-shrink-0">⚠️</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{note.publishTime}</div>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="p-1 hover:bg-red-100 rounded transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3 text-gray-400" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-0.5">
                  <Eye className="w-3 h-3" />
                  {(note.views / 1000).toFixed(1)}k
                </span>
                <span className="flex items-center gap-0.5">
                  <Heart className="w-3 h-3" />
                  {note.likes}
                </span>
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="w-3 h-3" />
                  {note.comments}
                </span>
                <span className={`flex items-center gap-0.5 ml-auto ${
                  note.trend === 'up' ? 'text-green-600' :
                  note.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  <TrendingUp className="w-3 h-3" />
                  {note.trend === 'up' ? '↑' : note.trend === 'down' ? '↓' : '→'}
                </span>
              </div>
              {note.shouldDelete && (
                <div className="mt-1.5 pt-1.5 border-t border-red-200">
                  <p className="text-xs text-red-700">
                    数据低于阈值，建议删除以维护账号质量
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
