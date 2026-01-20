import { useState, useCallback } from "react";

interface Template {
  id: number;
  name: string;
  category: string;
  tags: string[];
  usageCount: number;
  createdAt?: string;
}

interface UseTemplatesOptions {
  category?: "image_style" | "writing_tone" | "content_structure";
}

export function useTemplates(options?: UseTemplatesOptions) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.category) params.set("category", options.category);
      if (query) params.set("query", query);

      const res = await fetch(`/api/templates?${params}`);
      if (!res.ok) throw new Error("Failed to fetch templates");

      const data = await res.json();
      setTemplates(data.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [options?.category]);

  const createTemplate = useCallback(async (template: {
    name: string;
    category: string;
    systemPrompt: string;
    tags?: string[];
  }) => {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });
    if (!res.ok) throw new Error("Failed to create template");
    const data = await res.json();
    await fetchTemplates();
    return data.id;
  }, [fetchTemplates]);

  const applyTemplate = useCallback(async (id: number) => {
    const res = await fetch(`/api/templates/${id}`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to apply template");
    return res.json();
  }, []);

  const deleteTemplate = useCallback(async (id: number) => {
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete template");
    await fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    applyTemplate,
    deleteTemplate,
  };
}
