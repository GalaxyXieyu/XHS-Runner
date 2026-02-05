export interface ContentPackage {
  id: string;
  titles: string[];
  selectedTitleIndex: number;
  content: string;
  tags: string[];
  coverImage?: string;
  images?: string[];  // 所有图片 URL
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
  imageModel?: 'nanobanana' | 'jimeng' | 'jimeng-45';
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
