import { NextApiRequest, NextApiResponse } from 'next';
import { taskManager, subscribeTaskEvents } from '@/server/services/task';

const TERMINAL_EVENT_TYPES = new Set(['workflow_complete', 'workflow_failed']);

function writeEvent(res: NextApiResponse, payload: any) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
}

function writeDone(res: NextApiResponse) {
  res.write('data: [DONE]\n\n');
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const taskId = Number(req.query.taskId);
  if (!Number.isFinite(taskId)) {
    return res.status(400).json({ error: 'taskId is required' });
  }

  const fromIndex = req.query.fromIndex ? Number(req.query.fromIndex) : 0;
  const startIndex = Number.isFinite(fromIndex) ? Math.max(0, fromIndex) : 0;

  let closed = false;
  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    if (unsubscribe) {
      await unsubscribe();
    }
    res.end();
  };

  res.on('close', () => {
    void cleanup();
  });

  try {
    const status = await taskManager.getTaskStatus(taskId);
    if (!status) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    heartbeat = setInterval(() => {
      if (!closed) {
        res.write(':keep-alive\n\n');
      }
    }, 15000);

    const events = await taskManager.getTaskEvents(taskId, startIndex);

    for (const event of events) {
      writeEvent(res, event);
    }

    const lastEvent = events[events.length - 1];
    if (lastEvent && TERMINAL_EVENT_TYPES.has(lastEvent.type)) {
      writeDone(res);
      await cleanup();
      return;
    }

    if (events.length === 0 && (status.status === 'completed' || status.status === 'failed')) {
      writeDone(res);
      await cleanup();
      return;
    }

    unsubscribe = await subscribeTaskEvents(taskId, async (event) => {
      if (closed) return;
      writeEvent(res, event);
      if (TERMINAL_EVENT_TYPES.has(event.type)) {
        writeDone(res);
        await cleanup();
      }
    });
  } catch (error: any) {
    console.error('[tasks] events failed:', error);
    if (!closed) {
      // SSE 已启动后不能返回 JSON，需要通过 SSE 发送错误
      if (res.headersSent) {
        writeEvent(res, { type: 'error', content: error?.message || 'Internal server error', timestamp: Date.now() });
        writeDone(res);
        await cleanup();
      } else {
        res.status(500).json({ error: error?.message || 'Internal server error' });
      }
    }
  }
}
