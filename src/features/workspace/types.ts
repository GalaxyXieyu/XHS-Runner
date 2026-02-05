import type { Theme } from '@/App';

export interface CreativeTabProps {
  theme: Theme;
  themes?: Theme[];
  onSelectTheme?: (themeId: string) => void;
  // 状态提升：外部控制 mainTab
  mainTab?: 'generate' | 'library';
  // 回调：通知父组件素材库数量
  onLibraryCountChange?: (count: number) => void;
}
