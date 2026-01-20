"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AskUserOption {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UserResponse {
  selectedIds?: string[];
  customInput?: string;
  modifiedContext?: Record<string, unknown>;
}

interface AskUserDialogProps {
  open: boolean;
  question: string;
  options?: AskUserOption[];
  selectionType: "single" | "multiple" | "none";
  allowCustomInput: boolean;
  context?: Record<string, unknown>;
  threadId: string;
  onSubmit: (response: UserResponse) => void;
  onCancel: () => void;
}

export function AskUserDialog({
  open,
  question,
  options = [],
  selectionType,
  allowCustomInput,
  context,
  onSubmit,
  onCancel,
}: AskUserDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");

  const hasImages = options.some((o) => o.imageUrl);

  const handleSingleSelect = (id: string) => {
    setSelectedIds([id]);
  };

  const handleMultiSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleSubmit = () => {
    const response: UserResponse = {};
    if (selectionType !== "none" && selectedIds.length > 0) {
      response.selectedIds = selectedIds;
    }
    if (allowCustomInput && customInput.trim()) {
      response.customInput = customInput.trim();
    }
    onSubmit(response);
  };

  const canSubmit =
    selectionType === "none"
      ? allowCustomInput && customInput.trim().length > 0
      : selectedIds.length > 0 || (allowCustomInput && customInput.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 单选模式 */}
          {selectionType === "single" && options.length > 0 && (
            <RadioGroup value={selectedIds[0] || ""} onValueChange={handleSingleSelect}>
              {hasImages ? (
                <div className="grid grid-cols-2 gap-3">
                  {options.map((opt) => (
                    <label
                      key={opt.id}
                      className={`relative flex flex-col items-center p-3 border rounded-lg cursor-pointer hover:bg-accent ${
                        selectedIds[0] === opt.id ? "border-primary bg-accent" : ""
                      }`}
                    >
                      <RadioGroupItem value={opt.id} className="sr-only" />
                      {opt.imageUrl && (
                        <img
                          src={opt.imageUrl}
                          alt={opt.label}
                          className="w-full h-24 object-cover rounded mb-2"
                        />
                      )}
                      <span className="font-medium text-sm">{opt.label}</span>
                      {opt.description && (
                        <span className="text-xs text-muted-foreground mt-1">
                          {opt.description}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {options.map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent ${
                        selectedIds[0] === opt.id ? "border-primary bg-accent" : ""
                      }`}
                    >
                      <RadioGroupItem value={opt.id} />
                      <div className="flex-1">
                        <span className="font-medium">{opt.label}</span>
                        {opt.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {opt.description}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </RadioGroup>
          )}

          {/* 多选模式 */}
          {selectionType === "multiple" && options.length > 0 && (
            <div className={hasImages ? "grid grid-cols-3 gap-2" : "space-y-2"}>
              {options.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent ${
                    selectedIds.includes(opt.id) ? "border-primary bg-accent" : ""
                  }`}
                >
                  <Checkbox
                    checked={selectedIds.includes(opt.id)}
                    onCheckedChange={(checked) =>
                      handleMultiSelect(opt.id, checked as boolean)
                    }
                  />
                  <div className="flex-1">
                    {opt.imageUrl && (
                      <img
                        src={opt.imageUrl}
                        alt={opt.label}
                        className="w-full h-16 object-cover rounded mb-1"
                      />
                    )}
                    <span className="font-medium text-sm">{opt.label}</span>
                    {opt.description && (
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* 上下文预览 */}
          {context && Object.keys(context).length > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground mb-2 block">
                当前内容预览
              </Label>
              <pre className="text-xs overflow-auto max-h-32">
                {JSON.stringify(context, null, 2)}
              </pre>
            </div>
          )}

          {/* 自定义输入 */}
          {allowCustomInput && (
            <div className="space-y-2">
              <Label>
                {selectionType === "none" ? "请输入" : "其他 (可选)"}
              </Label>
              <Textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder={
                  selectionType === "none"
                    ? "请输入您的内容..."
                    : "输入自定义内容..."
                }
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
