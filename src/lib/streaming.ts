/**
 * Enhanced Streaming Types for XHS Generator
 *
 * This file extends the existing SSE streaming with structured state management
 * to eliminate the need for polling while keeping the LangGraph workflow intact.
 */

import { z } from 'zod';

// Re-export existing types from artifacts.ts
export * from './artifacts';

/**
 * Enhanced SSE Event Types
 * These extend the existing AgentEvent types with progress tracking
 */

export interface ImageProgressEvent {
  type: 'image_progress';
  taskId: number;
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress: number; // 0-1
  url?: string;
  errorMessage?: string;
  timestamp: number;
}

export interface ContentUpdateEvent {
  type: 'content_update';
  title?: string;
  body?: string;
  tags?: string[];
  timestamp: number;
}

export interface WorkflowProgressEvent {
  type: 'workflow_progress';
  phase: string;
  progress: number; // 0-1
  currentAgent: string;
  timestamp: number;
}

// Union type for all possible SSE events
export type EnhancedAgentEvent =
  | ImageProgressEvent
  | ContentUpdateEvent
  | WorkflowProgressEvent
  | {
      type: 'agent_start' | 'agent_end' | 'message' | 'tool_call' | 'tool_result' | 'state_update' | 'supervisor_decision' | 'brief_ready' | 'layout_spec_ready' | 'alignment_map_ready' | 'quality_score';
      agent?: string;
      content?: string;
      timestamp: number;
      [key: string]: any;
    };

/**
 * Frontend State Management
 * Structured state that accumulates from SSE events
 */

export interface StreamingUIState {
  // Content state
  content: {
    title: string;
    body: string;
    tags: string[];
    status: 'draft' | 'reviewing' | 'approved' | 'rejected';
  };

  // Image tasks state
  imageTasks: Array<{
    id: number;
    prompt: string;
    status: 'queued' | 'generating' | 'complete' | 'failed';
    progress: number;
    url?: string;
    errorMessage?: string;
  }>;

  // Workflow state
  workflow: {
    currentAgent: string;
    phase: string;
    progress: number;
    isComplete: boolean;
  };

  // Event history
  events: EnhancedAgentEvent[];

  // Error state
  error?: string;
}

/**
 * Helper function to create initial UI state
 */
export function createInitialUIState(): StreamingUIState {
  return {
    content: {
      title: '',
      body: '',
      tags: [],
      status: 'draft',
    },
    imageTasks: [],
    workflow: {
      currentAgent: '',
      phase: '',
      progress: 0,
      isComplete: false,
    },
    events: [],
  };
}

/**
 * State reducer for processing SSE events
 * This eliminates the need for polling by updating state from events
 */
export function reduceStreamingState(
  state: StreamingUIState,
  event: EnhancedAgentEvent
): StreamingUIState {
  const newState = { ...state };

  // Add event to history
  newState.events = [...state.events, event];

  switch (event.type) {
    case 'content_update':
      newState.content = {
        ...state.content,
        ...(event.title && { title: event.title }),
        ...(event.body && { body: event.body }),
        ...(event.tags && { tags: event.tags }),
      };
      break;

    case 'image_progress':
      const existingTaskIndex = state.imageTasks.findIndex(t => t.id === event.taskId);
      if (existingTaskIndex >= 0) {
        // Update existing task
        newState.imageTasks = [...state.imageTasks];
        newState.imageTasks[existingTaskIndex] = {
          ...state.imageTasks[existingTaskIndex],
          status: event.status,
          progress: event.progress,
          ...(event.url && { url: event.url }),
          ...(event.errorMessage && { errorMessage: event.errorMessage }),
        };
      } else {
        // Add new task
        newState.imageTasks = [
          ...state.imageTasks,
          {
            id: event.taskId,
            prompt: '', // Will be filled from image_planner_agent
            status: event.status,
            progress: event.progress,
            url: event.url,
            errorMessage: event.errorMessage,
          },
        ];
      }
      break;

    case 'workflow_progress':
      newState.workflow = {
        currentAgent: event.currentAgent,
        phase: event.phase,
        progress: event.progress,
        isComplete: event.progress >= 1,
      };
      break;

    case 'agent_start':
      newState.workflow.currentAgent = event.agent || '';
      break;

    case 'agent_end':
      // Calculate overall progress based on agent completion
      const agentWeights: Record<string, number> = {
        brief_compiler_agent: 0.08,
        research_agent: 0.12,
        reference_intelligence_agent: 0.1,
        layout_planner_agent: 0.1,
        writer_agent: 0.2,
        image_planner_agent: 0.12,
        image_agent: 0.2,
        review_agent: 0.1,
      };
      const weight = agentWeights[event.agent || ''] || 0;
      newState.workflow.progress = Math.min(1, state.workflow.progress + weight);
      break;
  }

  return newState;
}

/**
 * Custom React hook for SSE streaming with state management
 * This replaces the polling mechanism
 */
export interface UseStreamingOptions {
  onUpdate?: (state: StreamingUIState) => void;
  onComplete?: (state: StreamingUIState) => void;
  onError?: (error: string) => void;
}

export function createStreamingStateManager(options: UseStreamingOptions = {}) {
  let state = createInitialUIState();
  let eventSource: EventSource | null = null;

  const connect = (url: string) => {
    eventSource = new EventSource(url);

    eventSource.onmessage = (e) => {
      if (e.data === '[DONE]') {
        state.workflow.isComplete = true;
        options.onComplete?.(state);
        eventSource?.close();
        return;
      }

      try {
        const event = JSON.parse(e.data) as EnhancedAgentEvent;
        state = reduceStreamingState(state, event);
        options.onUpdate?.(state);
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      options.onError?.('Connection error');
      eventSource?.close();
    };

    return () => {
      eventSource?.close();
    };
  };

  const getState = () => state;

  return { connect, getState };
}
