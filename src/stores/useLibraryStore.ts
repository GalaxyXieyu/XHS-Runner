import { create } from 'zustand';
import type { ContentPackage } from '@/features/material-library/types';

interface LibraryFilter {
  source: string;
  searchQuery: string;
}

interface LibraryStore {
  // 状态
  allPackages: ContentPackage[];
  selectedPackages: string[];
  editingPackage: ContentPackage | null;
  libraryFilter: LibraryFilter;
  loading: boolean;

  // Actions
  setAllPackages: (packages: ContentPackage[] | ((prev: ContentPackage[]) => ContentPackage[])) => void;
  setSelectedPackages: (ids: string[]) => void;
  setEditingPackage: (pkg: ContentPackage | null) => void;
  setLibraryFilter: (filter: LibraryFilter) => void;

  loadPackages: (themeId: number) => Promise<void>;
  deletePackage: (id: string) => Promise<void>;
  batchDelete: (ids: string[]) => Promise<void>;
  batchPublish: (ids: string[]) => Promise<void>;
}

// 规范化 creative 数据
function normalizeCreative(row: any): ContentPackage {
  const creative = row.creative || row;
  const assets = row.assets || [];
  const coverImage = assets[0]?.id ? `/api/assets/${assets[0].id}` : (creative.cover_image || creative.coverImage);

  // 解析 tags
  let tags: string[] = [];
  if (Array.isArray(creative.tags)) {
    tags = creative.tags;
  } else if (typeof creative.tags === 'string' && creative.tags) {
    tags = creative.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
  }

  return {
    id: String(creative.id),
    titles: Array.isArray(creative.titles) ? creative.titles : [creative.title || '未命名内容包'],
    selectedTitleIndex: creative.selected_title_index || 0,
    content: creative.content || creative.body || '',
    tags,
    coverImage,
    qualityScore: creative.quality_score || creative.qualityScore || 0,
    predictedMetrics: creative.predicted_metrics || creative.predictedMetrics || { likes: 0, collects: 0, comments: 0 },
    actualMetrics: creative.actual_metrics || creative.actualMetrics,
    rationale: creative.rationale || '',
    status: creative.status || 'draft',
    publishedAt: creative.published_at || creative.publishedAt,
    createdAt: creative.created_at?.split('T')[0] || creative.createdAt || new Date().toLocaleString('zh-CN'),
    imageModel: creative.image_model || creative.imageModel,
    source: creative.source || 'manual',
    sourceName: creative.source_name || creative.sourceName || '手动创建',
  };
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  // 初始状态
  allPackages: [],
  selectedPackages: [],
  editingPackage: null,
  libraryFilter: {
    source: 'all',
    searchQuery: '',
  },
  loading: false,

  // Simple setters
  setAllPackages: (packages) => set((state) => ({
    allPackages: typeof packages === 'function' ? packages(state.allPackages) : packages
  })),
  setSelectedPackages: (ids) => set({ selectedPackages: ids }),
  setEditingPackage: (pkg) => set({ editingPackage: pkg }),
  setLibraryFilter: (filter) => set({ libraryFilter: filter }),

  // 加载内容包列表
  loadPackages: async (themeId: number) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/creatives?themeId=${themeId}&withAssets=true`);
      const data = await res.json();
      const list = Array.isArray(data) ? data.map(normalizeCreative) : [];
      set({ allPackages: list });
    } catch (error) {
      console.error('Failed to load creatives:', error);
      set({ allPackages: [] });
    } finally {
      set({ loading: false });
    }
  },

  // 删除内容包
  deletePackage: async (id: string) => {
    try {
      const res = await fetch('/api/creatives', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id) }),
      });

      if (res.ok) {
        set((state) => ({
          allPackages: state.allPackages.filter((p) => p.id !== id),
        }));
      }
    } catch (error) {
      console.error('Failed to delete package:', error);
      throw error;
    }
  },

  // 批量删除
  batchDelete: async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id =>
        fetch('/api/creatives', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: Number(id) }),
        })
      ));

      set((state) => ({
        allPackages: state.allPackages.filter((p) => !ids.includes(p.id)),
        selectedPackages: [],
      }));
    } catch (error) {
      console.error('Failed to batch delete:', error);
      throw error;
    }
  },

  // 批量发布
  batchPublish: async (ids: string[]) => {
    const { allPackages } = get();
    const draftIds = ids.filter(id => allPackages.find(p => p.id === id)?.status === 'draft');

    if (draftIds.length === 0) return;

    try {
      await Promise.all(draftIds.map(id =>
        fetch(`/api/creatives/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        })
      ));

      set((state) => ({
        allPackages: state.allPackages.map((p) =>
          draftIds.includes(p.id) ? { ...p, status: 'published' as const } : p
        ),
        selectedPackages: [],
      }));
    } catch (error) {
      console.error('Failed to batch publish:', error);
      throw error;
    }
  },
}));
