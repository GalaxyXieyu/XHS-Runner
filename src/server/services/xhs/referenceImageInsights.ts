export type ReferenceImageInsightType = "screenshot" | "logo" | "photo" | "illustration" | "unknown";
export type ReferenceImageInsightBucket = "style" | "content" | "both";

// Model contract for reference-image routing and prompt enrichment.
export interface ReferenceImageInsight {
  type: ReferenceImageInsightType;
  style_tags: string[];
  content_tags: string[];
  layout_hints: string[];
  confidence: number;
  bucket: ReferenceImageInsightBucket;
}
