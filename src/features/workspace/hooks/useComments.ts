/**
 * 评论管理 Hook
 */

import { useState, useEffect, useCallback } from 'react';

export interface Comment {
  id: string;
  noteTitle: string;
  author: string;
  authorAvatar?: string;
  content: string;
  time: string;
  replied: boolean;
  replyStatus?: string;
  replyContent?: string;
  publishRecordId?: number;
}

interface UseCommentsOptions {
  publishRecordId?: number;
  replyStatus?: string;
}

export function useComments(options: UseCommentsOptions = {}) {
  const { publishRecordId, replyStatus } = options;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (publishRecordId) params.set('publishRecordId', String(publishRecordId));
      if (replyStatus) params.set('replyStatus', replyStatus);

      const res = await fetch(`/api/operations/comments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch comments');

      const data = await res.json();
      setComments(data.comments || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [publishRecordId, replyStatus]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // 同步评论
  const syncComments = useCallback(async (targetPublishRecordId?: number) => {
    try {
      const res = await fetch('/api/operations/comments/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishRecordId: targetPublishRecordId }),
      });
      if (!res.ok) throw new Error('Failed to sync comments');
      await fetchComments();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchComments]);

  // 生成 AI 回复
  const generateAIReply = useCallback(async (commentId: string) => {
    try {
      const res = await fetch(`/api/operations/comments/${commentId}/ai-reply`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to generate AI reply');
      const data = await res.json();
      return data.reply as string;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  // 发送回复
  const sendReply = useCallback(async (commentId: string, content: string) => {
    try {
      const res = await fetch(`/api/operations/comments/${commentId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Failed to send reply');

      // 更新本地状态
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, replied: true, replyStatus: 'sent', replyContent: content } : c
        )
      );
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, []);

  return {
    comments,
    loading,
    error,
    refresh: fetchComments,
    syncComments,
    generateAIReply,
    sendReply,
  };
}
