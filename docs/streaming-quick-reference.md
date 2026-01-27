# Streaming Enhancement - Quick Reference Guide

## New Components Usage

### 1. ProgressBar Component

```tsx
import { ProgressBar } from '@/components/agent/ProgressBar';

// Basic usage
<ProgressBar value={0.75} />

// With label and custom styling
<ProgressBar
  value={0.5}
  label="Generating images..."
  showPercentage={true}
  className="my-4"
/>
```

**Props:**
- `value: number` - Progress value from 0 to 1 (required)
- `label?: string` - Optional label text
- `showPercentage?: boolean` - Show percentage (default: true)
- `className?: string` - Additional CSS classes

---

### 2. ImageCard Component

```tsx
import { ImageCard } from '@/components/agent/ImageCard';

// Queued state
<ImageCard status="queued" />

// Generating with progress
<ImageCard
  status="generating"
  progress={0.65}
  prompt="A beautiful sunset over mountains"
/>

// Complete with image
<ImageCard
  status="complete"
  url="/api/assets/123"
  prompt="A beautiful sunset over mountains"
/>

// Failed with error
<ImageCard
  status="failed"
  errorMessage="Generation failed: timeout"
/>
```

**Props:**
- `status: 'queued' | 'generating' | 'complete' | 'failed'` - Current status (required)
- `progress?: number` - Progress value 0-1 (for generating state)
- `url?: string` - Image URL (for complete state)
- `errorMessage?: string` - Error message (for failed state)
- `prompt?: string` - Image generation prompt
- `className?: string` - Additional CSS classes

---

### 3. AgentEventTimeline Component

```tsx
import { AgentEventTimeline } from '@/components/agent/AgentEventTimeline';
import type { AgentEvent } from '@/features/agent/types';

const events: AgentEvent[] = [
  {
    type: 'agent_start',
    agent: 'writer_agent',
    content: 'Starting content creation...',
    timestamp: Date.now(),
  },
  // ... more events
];

<AgentEventTimeline events={events} />
```

**Props:**
- `events: AgentEvent[]` - Array of agent events (required)
- `className?: string` - Additional CSS classes

**Event Icons:**
- `agent_start` - Blue bot icon
- `tool_call` - Orange wrench icon
- `agent_end` - Green checkmark icon
- `message` - Purple message icon
- Other types - Gray alert icon

---

### 4. useAgentStreaming Hook

```tsx
import { useAgentStreaming } from '@/features/agent/hooks/useAgentStreaming';

function MyComponent() {
  const { state, isStreaming, error, startStreaming } = useAgentStreaming({
    onUpdate: (state) => {
      console.log('State updated:', state);
    },
    onComplete: (state) => {
      console.log('Streaming complete:', state);
    },
    onError: (error) => {
      console.error('Streaming error:', error);
    },
  });

  const handleGenerate = async () => {
    await startStreaming(
      'Create a post about travel tips',
      themeId,
      {
        referenceImages: ['url1', 'url2'],
        imageGenProvider: 'jimeng',
        enableHITL: true,
      }
    );
  };

  return (
    <div>
      {/* Display content */}
      <h2>{state.content.title}</h2>
      <p>{state.content.body}</p>

      {/* Display image tasks */}
      {state.imageTasks.map(task => (
        <ImageCard key={task.id} {...task} />
      ))}

      {/* Display workflow progress */}
      <ProgressBar value={state.workflow.progress} />

      {/* Display events */}
      <AgentEventTimeline events={state.events} />
    </div>
  );
}
```

**Hook Return Value:**
- `state: StreamingUIState` - Current streaming state
  - `content` - Content with title, body, tags, status
  - `imageTasks` - Array of image generation tasks
  - `workflow` - Current agent, phase, progress, isComplete
  - `events` - Array of all events
  - `error?` - Error message if any
- `isStreaming: boolean` - Whether streaming is active
- `error: string | null` - Error message if streaming failed
- `startStreaming: (message, themeId?, options?) => Promise<void>` - Start streaming

---

## SSE Event Types

The backend now sends these enhanced event types:

### image_progress
```typescript
{
  type: 'image_progress',
  taskId: number,
  status: 'queued' | 'generating' | 'complete' | 'failed',
  progress: number, // 0-1
  url?: string,
  errorMessage?: string,
  timestamp: number
}
```

### content_update
```typescript
{
  type: 'content_update',
  title?: string,
  body?: string,
  tags?: string[],
  timestamp: number
}
```

### workflow_progress
```typescript
{
  type: 'workflow_progress',
  phase: string,
  progress: number, // 0-1
  currentAgent: string,
  timestamp: number
}
```

---

## Migration Guide

### Before (with polling):
```tsx
// Old approach - polling every 2 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    setImageTasks(prev => /* update */);
  }, 2000);
  return () => clearInterval(interval);
}, [imageTasks]);
```

### After (with SSE):
```tsx
// New approach - real-time updates via SSE
const { state } = useAgentStreaming();

// Image tasks update automatically via SSE events
// No polling needed!
{state.imageTasks.map(task => (
  <ImageCard key={task.id} {...task} />
))}
```

---

## Debugging Tips

### Check SSE Events in Browser
1. Open DevTools → Network tab
2. Filter by "stream"
3. Click on the `/api/agent/stream` request
4. View the EventStream tab to see real-time events

### Common Issues

**Images not updating:**
- Check that `sendImageProgress()` is being called in backend
- Verify `image_progress` events are in the SSE stream
- Check browser console for parsing errors

**Content not appearing:**
- Verify `sendContentUpdate()` is called after writer_agent
- Check that `content_update` events have title/body/tags
- Ensure event handler in AgentCreator is processing the event

**Progress bar not moving:**
- Check that `workflow_progress` events are being sent
- Verify progress values are between 0 and 1
- Check that agent_end events are triggering progress updates

---

## Performance Monitoring

### Before Enhancement
- HTTP Requests: ~120/minute (polling every 2s for 4 images)
- Update Latency: 0-2000ms (depends on poll timing)
- Network Traffic: High (constant polling)

### After Enhancement
- HTTP Requests: 0 (no polling)
- Update Latency: <100ms (real-time SSE)
- Network Traffic: Low (single SSE connection)

### Metrics to Track
```typescript
// Track SSE connection time
const startTime = Date.now();
await startStreaming(message);
const duration = Date.now() - startTime;

// Track event processing
let eventCount = 0;
const { state } = useAgentStreaming({
  onUpdate: (state) => {
    eventCount = state.events.length;
  }
});
```
