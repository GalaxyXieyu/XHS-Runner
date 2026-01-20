"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTemplates } from "../hooks/useTemplates";

interface Template {
  id: number;
  name: string;
  category: string;
  tags: string[];
  usageCount: number;
}

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  category?: "image_style" | "writing_tone" | "content_structure";
  showSearch?: boolean;
}

const categoryLabels: Record<string, string> = {
  image_style: "图片风格",
  writing_tone: "写作风格",
  content_structure: "内容结构",
};

export function TemplateSelector({
  onSelect,
  category,
  showSearch = true,
}: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(category || "all");
  const { templates, loading, fetchTemplates } = useTemplates({
    category: category,
  });

  useEffect(() => {
    fetchTemplates(searchQuery || undefined);
  }, [fetchTemplates, searchQuery]);

  const filteredTemplates = templates.filter((t) => {
    if (selectedCategory !== "all" && t.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="flex gap-2">
          <Input
            placeholder="搜索模板..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          {!category && (
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="image_style">图片风格</SelectItem>
                <SelectItem value="writing_tone">写作风格</SelectItem>
                <SelectItem value="content_structure">内容结构</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground py-4">加载中...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center text-muted-foreground py-4">暂无模板</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
              onClick={() => onSelect(template)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{template.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {categoryLabels[template.category] || template.category}
                  </Badge>
                </div>
                {template.tags && template.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {template.tags.slice(0, 3).map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                使用 {template.usageCount} 次
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
