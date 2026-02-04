import { createRedisSubscriber, getRedisClient } from '@/server/services/redis';
import type { TaskEventEnvelope } from './types';

function buildChannel(taskId: number) {
  return `task:events:${taskId}`;
}

export async function publishTaskEvent(taskId: number, event: TaskEventEnvelope) {
  const redis = getRedisClient();
  await redis.publish(buildChannel(taskId), JSON.stringify(event));
}

export async function subscribeTaskEvents(
  taskId: number,
  onMessage: (event: TaskEventEnvelope) => void
) {
  const subscriber = createRedisSubscriber();
  const channel = buildChannel(taskId);

  await subscriber.subscribe(channel);

  subscriber.on('message', (messageChannel, message) => {
    if (messageChannel !== channel) return;
    try {
      const parsed = JSON.parse(message) as TaskEventEnvelope;
      onMessage(parsed);
    } catch (error) {
      console.warn('[taskPubSub] Failed to parse event message:', error);
    }
  });

  return async () => {
    await subscriber.unsubscribe(channel);
    subscriber.disconnect();
  };
}
