/**
 * Artifact Definitions for XHS Content Generation
 */

import { z } from "zod";

export const ImageTaskStatus = z.enum(["queued", "generating", "complete", "failed"]);
export type ImageTaskStatus = z.infer<typeof ImageTaskStatus>;

export const ContentStatus = z.enum(["draft", "reviewing", "approved", "rejected"]);
export type ContentStatus = z.infer<typeof ContentStatus>;

export const AgentType = z.enum([
  "supervisor",
  "brief_compiler_agent",
  "research_evidence_agent",
  "reference_intelligence_agent",
  "layout_planner_agent",
  "writer_agent",
  "image_planner_agent",
  "image_agent",
  "review_agent",
]);
export type AgentType = z.infer<typeof AgentType>;

export const ImageTaskSchema = z.object({
  id: z.number(),
  prompt: z.string(),
  status: ImageTaskStatus,
  progress: z.number().min(0).max(1),
  url: z.string().optional(),
  errorMessage: z.string().optional(),
  aspectRatio: z.string().optional(),
  model: z.string().optional(),
});
export type ImageTask = z.infer<typeof ImageTaskSchema>;

export const ContentPackageSchema = z.object({
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  status: ContentStatus,
  images: z.array(ImageTaskSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ContentPackage = z.infer<typeof ContentPackageSchema>;

export const AgentEventSchema = z.object({
  type: z.enum(["agent_start", "agent_end", "agent_message", "agent_error", "progress"]),
  agent: AgentType.optional(),
  message: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const StreamingStateSchema = z.object({
  content: ContentPackageSchema.optional(),
  currentAgent: AgentType.optional(),
  phase: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  events: z.array(AgentEventSchema),
  isComplete: z.boolean(),
  error: z.string().optional(),
});
export type StreamingState = z.infer<typeof StreamingStateSchema>;

export function createInitialStreamingState(): StreamingState {
  return {
    content: {
      title: "",
      body: "",
      tags: [],
      status: "draft",
      images: [],
    },
    events: [],
    isComplete: false,
    progress: 0,
  };
}

export function updateContentInState(
  state: StreamingState,
  updates: Partial<ContentPackage>
): StreamingState {
  return {
    ...state,
    content: {
      ...state.content!,
      ...updates,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function addEventToState(
  state: StreamingState,
  event: Omit<AgentEvent, "timestamp">
): StreamingState {
  return {
    ...state,
    events: [
      ...state.events,
      {
        ...event,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export function updateImageTaskInState(
  state: StreamingState,
  taskId: number,
  updates: Partial<ImageTask>
): StreamingState {
  if (!state.content) return state;

  return {
    ...state,
    content: {
      ...state.content,
      images: state.content.images.map((img) =>
        img.id === taskId ? { ...img, ...updates } : img
      ),
      updatedAt: new Date().toISOString(),
    },
  };
}
