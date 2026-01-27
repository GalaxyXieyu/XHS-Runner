# XHS Generator - Streaming Enhancement Implementation Plan

## 🎯 Objective

Eliminate polling mechanism and enhance real-time streaming without replacing the existing LangGraph workflow.

## 📊 Current vs. Proposed Architecture

### Current Architecture
```
LangGraph Workflow → SSE Events → Frontend
                                    ↓
                              Polling (every 2s)
                                    ↓
                              /api/tasks/:id
```

### Proposed Architecture
```
LangGraph Workflow → Enhanced SSE Events → Frontend State Reducer
                                              ↓
                                        Real-time UI Updates
                                        (No Polling!)
```

## ✅ What We Keep
- ✅ LangGraph multi-agent orchestration
- ✅ SSE (Server-Sent Events) streaming
- ✅ Existing agent workflow
- ✅ HITL (Human-in-the-Loop) functionality

## 🔄 What We Change
- ❌ Remove polling mechanism (AgentCreator.tsx:202-222)
- ✅ Add image progress events to SSE stream
- ✅ Add structured state management on frontend
- ✅ Enhance event types with progress tracking

## 📁 Implementation Tasks

### Phase 1: Backend Enhancement (Day 1-2)

#### Task 1.1: Enhance SSE Event Types
**File:** `src/pages/api/agent/stream.ts`

Add new event types:
```typescript
// Add after line 94 (sendEvent function)

const sendImageProgress = (taskId: number, status: string, progress: number, url?: string) => {
  sendEvent({
    type: 'image_progress',
    taskId,
    status,
    progress,
    url,
    timestamp: Date.now(),
  } as any);
};

const sendContentUpdate = (title?: string, body?: string, tags?: string[]) => {
  sendEvent({
    type: 'content_update',
    title,
    body,
    tags,
    timestamp: Date.now(),
  } as any);
};

const sendWorkflowProgress = (phase: string, progress: number, currentAgent: string) => {
  sendEvent({
    type: 'workflow_progress',
    phase,
    progress,
    currentAgent,
    timestamp: Date.now(),
  } as any);
};
```

#### Task 1.2: Integrate Image Progress Events
**File:** `src/pages/api/agent/stream.ts`

Modify the image_agent section (around line 365) to send progress:
```typescript
if (nodeName === "image_agent") {
  // Send initial progress
  if (output.imagePlans?.length > 0) {
    output.imagePlans.forEach((plan: any, index: number) => {
      sendImageProgress(index + 1, 'queued', 0);
    });
  }

  // Monitor image generation and send progress
  // (This requires modifying the image generation service)

  if (output.imagesComplete) {
    // Send completion for all images
    output.generatedImages?.forEach((img: any, index: number) => {
      sendImageProgress(index + 1, 'complete', 1, img.url);
    });
  }
}
```

#### Task 1.3: Add Content Updates
**File:** `src/pages/api/agent/stream.ts`

Modify writer_agent section (around line 311):
```typescript
if (nodeName === "writer_agent" && themeId) {
  try {
    const parsed = parseWriterContent(msg.content);
    writerContent = parsed;

    // Send content update event
    sendContentUpdate(parsed.title, parsed.body, parsed.tags);

    const creative = await createCreative({...});
    creativeId = creative.id;
  } catch (saveError) {
    console.error("Failed to save creative:", saveError);
  }
}
```

### Phase 2: Frontend Enhancement (Day 3-4)

#### Task 2.1: Create Streaming Hook
**File:** `src/features/agent/hooks/useAgentStreaming.ts` (NEW)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { createInitialUIState, reduceStreamingState, type StreamingUIState, type EnhancedAgentEvent } from '@/lib/streaming';

export function useAgentStreaming() {
  const [state, setState] = useState<StreamingUIState>(createInitialUIState());
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStreaming = useCallback(async (message: string, themeId?: number, options?: any) => {
    setIsStreaming(true);
    setError(null);
    setState(createInitialUIState());

    try {
      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, themeId, ...options }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsStreaming(false);
              return;
            }

            try {
              const event = JSON.parse(data) as EnhancedAgentEvent;
              setState(prev => reduceStreamingState(prev, event));
            } catch (e) {
              console.error('Failed to parse event:', e);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsStreaming(false);
    }
  }, []);

  return {
    state,
    isStreaming,
    error,
    startStreaming,
  };
}
```

#### Task 2.2: Update AgentCreator Component
**File:** `src/features/agent/components/AgentCreator.tsx`

Replace the existing streaming logic:

```typescript
// Remove lines 202-222 (polling logic)
// Replace with:

import { useAgentStreaming } from '../hooks/useAgentStreaming';

export function AgentCreator({ theme }: AgentCreatorProps) {
  const { state, isStreaming, error, startStreaming } = useAgentStreaming();

  // Remove old state management
  // const [imageTasks, setImageTasks] = useState<ImageTask[]>([]);
  // const [isStreaming, setIsStreaming] = useState(false);

  // Use state from hook
  const { content, imageTasks, workflow, events } = state;

  const handleSubmit = async () => {
    await startStreaming(requirement, theme.id, {
      referenceImages,
      imageGenProvider,
      enableHITL,
    });
  };

  // Remove polling useEffect (lines 202-222)

  return (
    <div>
      {/* Display content */}
      <h2>{content.title}</h2>
      <p>{content.body}</p>

      {/* Display image tasks with real-time progress */}
      {imageTasks.map(task => (
        <ImageCard
          key={task.id}
          status={task.status}
          progress={task.progress}
          url={task.url}
        />
      ))}

      {/* Display workflow progress */}
      <ProgressBar value={workflow.progress} />
      <p>{workflow.phase}</p>
    </div>
  );
}
```

### Phase 3: UI Components (Day 4-5)

#### Task 3.1: Create ProgressBar Component
**File:** `src/components/agent/ProgressBar.tsx` (NEW)

```typescript
import { Progress } from '@/components/ui/progress';

interface ProgressBarProps {
  value: number; // 0-1
  label?: string;
  showPercentage?: boolean;
}

export function ProgressBar({ value, label, showPercentage = true }: ProgressBarProps) {
  const percentage = Math.round(value * 100);

  return (
    <div className="space-y-2">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <Progress value={percentage} />
      {showPercentage && (
        <p className="text-xs text-right text-muted-foreground">{percentage}%</p>
      )}
    </div>
  );
}
```

#### Task 3.2: Create Enhanced ImageCard Component
**File:** `src/components/agent/ImageCard.tsx` (NEW)

```typescript
import { Image as ImageIcon, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { ProgressBar } from './ProgressBar';

interface ImageCardProps {
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress: number;
  url?: string;
  errorMessage?: string;
}

export function ImageCard({ status, progress, url, errorMessage }: ImageCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      {status === 'complete' && url ? (
        <img src={url} alt="Generated" className="w-full rounded" />
      ) : (
        <div className="aspect-square bg-muted rounded flex items-center justify-center">
          {status === 'queued' && <ImageIcon className="w-12 h-12 text-muted-foreground" />}
          {status === 'generating' && <Loader2 className="w-12 h-12 animate-spin" />}
          {status === 'failed' && <XCircle className="w-12 h-12 text-destructive" />}
        </div>
      )}

      {status === 'generating' && (
        <ProgressBar value={progress} showPercentage />
      )}

      {status === 'complete' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span>生成完成</span>
        </div>
      )}

      {status === 'failed' && errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
```

#### Task 3.3: Create AgentEventTimeline Component
**File:** `src/components/agent/AgentEventTimeline.tsx` (NEW)

```typescript
import { type EnhancedAgentEvent } from '@/lib/streaming';
import { Bot, Wrench, CheckCircle } from 'lucide-react';

interface AgentEventTimelineProps {
  events: EnhancedAgentEvent[];
}

export function AgentEventTimeline({ events }: AgentEventTimelineProps) {
  return (
    <div className="space-y-2">
      {events.map((event, index) => (
        <div key={index} className="flex items-start gap-3 text-sm">
          <div className="mt-1">
            {event.type === 'agent_start' && <Bot className="w-4 h-4" />}
            {event.type === 'tool_call' && <Wrench className="w-4 h-4" />}
            {event.type === 'agent_end' && <CheckCircle className="w-4 h-4" />}
          </div>
          <div className="flex-1">
            <p className="font-medium">{event.agent}</p>
            {event.content && <p className="text-muted-foreground">{event.content}</p>}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}
```

### Phase 4: Testing (Day 5)

#### Task 4.1: Manual Testing Checklist
- [ ] Start agent workflow and verify events stream in real-time
- [ ] Verify image progress updates without polling
- [ ] Check content updates appear immediately
- [ ] Test workflow progress bar updates
- [ ] Verify HITL functionality still works
- [ ] Test error handling

#### Task 4.2: Performance Comparison
Measure before and after:
- HTTP requests per minute (should drop from ~120 to ~0)
- Update latency (should drop from 0-2000ms to <100ms)
- Memory usage
- CPU usage

## 📈 Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| HTTP Requests (4 images) | 120/min | 0 | 100% |
| Update Latency | 0-2000ms | <100ms | 95% |
| Code Lines | 1570 | ~1400 | -11% |
| Real-time Progress | ❌ | ✅ | New Feature |

## 🚀 Deployment Checklist

- [ ] All tests passing
- [ ] No console errors
- [ ] Performance metrics validated
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Merged to main branch

## 📝 Notes

- This approach keeps LangGraph intact
- SSE is more efficient than WebSockets for one-way streaming
- No new dependencies required (using existing `ai` package)
- Backward compatible with existing HITL functionality
