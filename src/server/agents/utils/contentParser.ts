/**
 * 解析 writer_agent 生成的内容（支持 JSON 和纯文本两种格式）
 */
export function parseWriterContent(content: string): { title: string; body: string; tags: string[] } {
  // 尝试解析 JSON 格式（writer_agent prompt 要求的格式）
  try {
    // 提取 JSON 部分（可能被包裹在 markdown 代码块中）
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*"title"[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

    // 尝试解析 JSON
    if (jsonStr.startsWith('{')) {
      const parsed = JSON.parse(jsonStr);
      if (parsed.title) {
        return {
          title: parsed.title,
          body: parsed.content || parsed.body || "",
          tags: Array.isArray(parsed.tags)
            ? parsed.tags.map((t: string) => t.replace(/^#/, ''))
            : [],
        };
      }
    }
  } catch {
    // JSON 解析失败，继续尝试纯文本格式
  }

  // 回退到纯文本格式解析
  const titleMatch = content.match(/标题[：:]\s*(.+?)(?:\n|$)/);
  const title = titleMatch?.[1]?.trim() || "AI 生成内容";

  const tagMatch = content.match(/标签[：:]\s*(.+?)(?:\n|$)/);
  const tagsStr = tagMatch?.[1] || "";
  const tags = tagsStr.match(/#[\w\u4e00-\u9fa5]+/g)?.map(t => t.slice(1)) || [];

  let body = content;
  if (titleMatch) {
    body = content.slice(content.indexOf(titleMatch[0]) + titleMatch[0].length);
  }
  if (tagMatch) {
    body = body.slice(0, body.indexOf(tagMatch[0])).trim();
  }

  return { title, body: body.trim() || content, tags };
}
