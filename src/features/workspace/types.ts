import type { Theme } from '@/App';

export interface CreativeTabProps {
  theme: Theme;
  themes?: Theme[];
  onSelectTheme?: (themeId: string) => void;
  onNavigateToTaskCenter?: (taskIds?: number[]) => void;
  // 状态提升：外部控制 mainTab
  mainTab?: 'generate' | 'library';
  // 状态提升：外部控制 generateMode（用于 App 顶部快捷入口）
  generateMode?: 'oneClick' | 'agent';
  onGenerateModeChange?: (mode: 'oneClick' | 'agent') => void;
  // 回调：通知父组件素材库数量和运行中任务数量
  onLibraryCountChange?: (count: number) => void;
}
