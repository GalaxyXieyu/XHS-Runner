import { useState, useCallback } from "react";
import { ImagePlan } from "@/server/agents/state/agentState";

interface WriterContent {
  title: string;
  body: string;
  tags: string[];
}

interface PendingConfirmation {
  type: "image_plans" | "content";
  data: ImagePlan[] | WriterContent;
  threadId: string;
}

interface ConfirmOptions {
  userFeedback?: string;
  saveAsTemplate?: {
    name: string;
    category: string;
    tags?: string[];
  };
}

export function useAgentConfirm() {
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirmationRequired = useCallback(
    (type: "image_plans" | "content", data: ImagePlan[] | WriterContent, threadId: string) => {
      setPendingConfirmation({ type, data, threadId });
    },
    []
  );

  const confirm = useCallback(
    async (
      action: "approve" | "modify" | "reject",
      modifiedData: ImagePlan[] | WriterContent,
      options?: ConfirmOptions
    ): Promise<ReadableStream<Uint8Array> | null> => {
      if (!pendingConfirmation) return null;

      setIsConfirming(true);
      try {
        const response = await fetch("/api/agent/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: pendingConfirmation.threadId,
            action,
            modifiedData,
            userFeedback: options?.userFeedback,
            saveAsTemplate: options?.saveAsTemplate,
          }),
        });

        if (!response.ok) {
          throw new Error(`Confirm failed: ${response.statusText}`);
        }

        setPendingConfirmation(null);
        return response.body;
      } finally {
        setIsConfirming(false);
      }
    },
    [pendingConfirmation]
  );

  const cancel = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  return {
    pendingConfirmation,
    isConfirming,
    handleConfirmationRequired,
    confirm,
    cancel,
  };
}
