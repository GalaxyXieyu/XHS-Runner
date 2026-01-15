export interface ContentPackage {
  id: string;
  titles: string[];
  selectedTitleIndex: number;
  content: string;
  tags: string[];
  coverImage?: string;
  qualityScore: number;
  predictedMetrics: {
    likes: number;
    collects: number;
    comments: number;
  };
  actualMetrics?: {
    likes: number;
    collects: number;
    comments: number;
    views: number;
  };
  rationale: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string;
  createdAt: string;
  imageModel?: 'nanobanana' | 'jimeng';
  source: 'manual' | string;
  sourceName: string;
}

export interface Content {
  id: string;
  title: string;
  type: 'article' | 'image' | 'video';
  createdAt: string;
  description: string;
  tags: string[];
  titleVariants: number;
  imageVariants: number;
  status: 'draft' | 'published';
}
