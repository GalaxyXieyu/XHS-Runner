"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImagePlan } from "@/server/agents/state/agentState";

interface WriterContent {
  title: string;
  body: string;
  tags: string[];
}

interface HITLConfirmDialogProps {
  open: boolean;
  type: "image_plans" | "content";
  data: ImagePlan[] | WriterContent;
  threadId: string;
  onConfirm: (
    action: "approve" | "modify" | "reject",
    data: ImagePlan[] | WriterContent,
    options?: {
      userFeedback?: string;
      saveAsTemplate?: { name: string; category: string; tags?: string[] };
    }
  ) => void;
  onCancel: () => void;
}

export function HITLConfirmDialog({
  open,
  type,
  data,
  threadId,
  onConfirm,
  onCancel,
}: HITLConfirmDialogProps) {
  const [editedData, setEditedData] = useState(data);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateTags, setTemplateTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const isImagePlans = type === "image_plans";
  const imagePlans = isImagePlans ? (editedData as ImagePlan[]) : [];
  const content = !isImagePlans ? (editedData as WriterContent) : null;

  const handleAddTag = () => {
    if (tagInput.trim() && !templateTags.includes(tagInput.trim())) {
      setTemplateTags([...templateTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTemplateTags(templateTags.filter((t) => t !== tag));
  };

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) return;
    onConfirm("approve", editedData, {
      saveAsTemplate: {
        name: templateName,
        category: isImagePlans ? "image_style" : "writing_tone",
        tags: templateTags,
      },
    });
  };

  const handleReject = () => {
    if (!feedback.trim()) return;
    onConfirm("reject", editedData, { userFeedback: feedback });
  };

  const updateImagePlan = (index: number, field: keyof ImagePlan, value: string) => {
    const updated = [...imagePlans];
    updated[index] = { ...updated[index], [field]: value };
    setEditedData(updated);
  };

  const updateContent = (field: keyof WriterContent, value: string | string[]) => {
    if (content) {
      setEditedData({ ...content, [field]: value });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isImagePlans ? "确认图片生成方案" : "确认文案内容"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isImagePlans ? (
            <div className="space-y-4">
              {imagePlans.map((plan, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">图 {plan.sequence}</Badge>
                    <span className="text-sm text-muted-foreground">{plan.role}</span>
                  </div>
                  <div>
                    <Label>描述</Label>
                    <Textarea
                      value={plan.description}
                      onChange={(e) => updateImagePlan(idx, "description", e.target.value)}
                      rows={2}
                    />
                  </div>
                  {plan.prompt && (
                    <div>
                      <Label>Prompt</Label>
                      <Textarea
                        value={plan.prompt}
                        onChange={(e) => updateImagePlan(idx, "prompt", e.target.value)}
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : content ? (
            <div className="space-y-4">
              <div>
                <Label>标题</Label>
                <Input
                  value={content.title}
                  onChange={(e) => updateContent("title", e.target.value)}
                />
              </div>
              <div>
                <Label>正文</Label>
                <Textarea
                  value={content.body}
                  onChange={(e) => updateContent("body", e.target.value)}
                  rows={8}
                />
              </div>
              <div>
                <Label>标签</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {content.tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {showFeedback && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg space-y-3">
              <Label>请描述您的修改意见：</Label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="例如：图片风格太暗了，我想要明亮清新的感觉..."
                rows={3}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowFeedback(false)}>
                  取消
                </Button>
                <Button size="sm" onClick={handleReject} disabled={!feedback.trim()}>
                  提交反馈并重新生成
                </Button>
              </div>
            </div>
          )}

          {showSaveTemplate && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3">
              <Label>模板名称</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="输入模板名称..."
              />
              <Label>标签</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="添加标签..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                />
                <Button variant="outline" size="sm" onClick={handleAddTag}>
                  添加
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {templateTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSaveTemplate(false)}>
                  取消
                </Button>
                <Button size="sm" onClick={handleSaveAsTemplate} disabled={!templateName.trim()}>
                  保存模板
                </Button>
              </div>
            </div>
          )}
        </div>

        {!showFeedback && !showSaveTemplate && (
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              取消流程
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFeedback(true)}
              className="text-orange-600"
            >
              不满意，重新生成
            </Button>
            <Button variant="outline" onClick={() => setShowSaveTemplate(true)}>
              保存为模板
            </Button>
            <Button onClick={() => onConfirm("approve", editedData)}>
              确认继续
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
